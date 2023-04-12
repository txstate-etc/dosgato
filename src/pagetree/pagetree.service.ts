import { type PageData } from '@dosgato/templating'
import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  type Pagetree, type PagetreeFilter, getPagetreesById, getPagetreesBySite, renamePagetree,
  getPagetreesByTemplate, SiteService, DosGatoService, PagetreeType, PagetreeResponse,
  promotePagetree, createPagetree, VersionedService, deletePagetree,
  undeletePagetree, archivePagetree, SiteServiceInternal, PageService, PageServiceInternal, getPagetrees
} from '../internal.js'

const PagetreesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPagetreesById(ids)
  }
})
const PagetreesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: PagetreeFilter) => {
    return await getPagetreesBySite(siteIds, filter)
  },
  extractKey: (p: Pagetree) => p.siteId,
  idLoader: PagetreesByIdLoader
})

const PagetreesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: string[], direct?: boolean) => {
    return await getPagetreesByTemplate(templateIds, direct)
  },
  idLoader: PagetreesByIdLoader
})

export class PagetreeServiceInternal extends BaseService {
  async find (filter?: PagetreeFilter) {
    const pagetrees = await getPagetrees(filter)
    for (const pagetree of pagetrees) {
      this.loaders.get(PagetreesByIdLoader).prime(pagetree.id, pagetree)
    }
    return pagetrees
  }

  async findById (id: string) {
    return await this.loaders.get(PagetreesByIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: string, direct?: boolean) {
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }
}

export class PagetreeService extends DosGatoService<Pagetree> {
  raw = this.svc(PagetreeServiceInternal)

  async find (filter?: PagetreeFilter) {
    const [ret] = await Promise.all([
      this.raw.find(filter),
      this.currentSiteRules() // pre-load and cache site rules so they're ready for removeUnauthorized
    ])
    return await this.removeUnauthorized(ret)
  }

  async findById (id: string) {
    const [ret] = await Promise.all([
      this.raw.findById(id),
      this.currentSiteRules() // pre-load and cache site rules so they're ready for removeUnauthorized
    ])
    return await this.removeUnauthorized(ret)
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByTemplateId (templateId: string, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByTemplateId(templateId, direct))
  }

  async create (siteId: string, data: PageData, validateOnly?: boolean) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Pagetree site does not exist.')
    const [primaryPagetree] = await this.raw.findBySiteId(siteId, { types: [PagetreeType.PRIMARY] })
    if (!primaryPagetree) throw new Error('Site has no primary pagetree.')
    const [rootPage] = await this.svc(PageServiceInternal).findByPagetreeId(primaryPagetree.id, { maxDepth: 0 })
    const linkId = rootPage.linkId
    if (!(await this.svc(SiteService).mayManageState(site))) {
      throw new Error('Current user is not permitted to create pagetrees in this site.')
    }
    const response = new PagetreeResponse({ success: true })
    // validate root page data if a template has been chosen
    if (data.templateKey) {
      const pageValidationResponse = await this.svc(PageService).validatePageData(data, site, undefined, undefined, site.name, linkId)
      if (pageValidationResponse.hasErrors()) {
        // take these errors and add them to the pagetree response
        for (const message of pageValidationResponse.messages) {
          response.addMessage(message.message, message.arg ? `data.${message.arg}` : undefined, message.type)
        }
      }
    }
    if (validateOnly || response.hasErrors()) return response
    const versionedService = this.svc(VersionedService)
    const currentUser = await this.currentUser()
    const pagetree = await createPagetree(versionedService, currentUser!, site, data, { linkId })
    this.loaders.clear()
    response.pagetree = pagetree
    return response
  }

  async rename (pagetreeId: string, name: string, validateOnly?: boolean) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be renamed does not exist.')
    if (!(await this.mayRename(pagetree))) throw new Error('Current user is not permitted to rename this pagetree.')
    const response = new PagetreeResponse({ success: true })
    const currentPagetrees = await this.raw.findBySiteId(pagetree.siteId)
    if (name !== pagetree.name && currentPagetrees.some(p => p.name === name)) {
      response.addMessage(`This site already has a pagetree with name ${name}.`, 'name')
    }
    if (response.hasErrors()) return response
    if (!validateOnly) {
      const currentUser = await this.currentUser()
      await renamePagetree(pagetreeId, name, currentUser!)
      this.loaders.clear()
      response.pagetree = await this.raw.findById(pagetreeId)
    }
    return response
  }

  async delete (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be deleted does not exist.')
    if (!(await this.mayDelete(pagetree))) throw new Error('Current user is not permitted to delete this pagetree.')
    const currentUser = await this.currentUser()
    await deletePagetree(pagetreeId, currentUser!)
    this.loaders.clear()
    const deletedPagetree = await this.raw.findById(pagetreeId)
    return new PagetreeResponse({ success: true, pagetree: deletedPagetree })
  }

  async undelete (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be restored does not exist.')
    if (!(await this.mayUndelete(pagetree))) throw new Error('Current user is not permitted to restore this pagetree.')
    const currentUser = await this.currentUser()
    await undeletePagetree(pagetreeId, currentUser!)
    this.loaders.clear()
    const restoredPagetree = await this.raw.findById(pagetreeId)
    return new PagetreeResponse({ success: true, pagetree: restoredPagetree })
  }

  async promote (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be promoted does not exist.')
    if (!(await this.mayPromote(pagetree))) throw new Error('Current user is not permitted to promote this pagetree.')
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const currentPrimaryPagetree = await this.raw.findById(site.primaryPagetreeId)
    try {
      const currentUser = await this.currentUser()
      await promotePagetree(currentPrimaryPagetree!.id, pagetreeId, site, currentUser!)
      this.loaders.clear()
      const updated = await this.raw.findById(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while promoting the pagetree.')
    }
  }

  async archive (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be archived does not exist.')
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('Primary pagetree cannot be archived')
    if (!(await this.mayArchive(pagetree))) throw new Error('Current user is not permitted to archive this pagetree.')
    try {
      const currentUser = await this.currentUser()
      await archivePagetree(pagetreeId, currentUser!)
      this.loaders.clear()
      const updated = await this.raw.findById(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while archiving the pagetree.')
    }
  }

  async mayView (pagetree: Pagetree) {
    const [siteRules, pageRules] = await Promise.all([
      this.currentSiteRules(),
      this.currentPageRules()
    ])
    for (const sr of siteRules) {
      if ((!sr.siteId || sr.siteId === pagetree.siteId) && sr.grants.viewForEdit) return true
    }
    for (const r of pageRules) {
      if (
        r.grants.view &&
        (!r.siteId || r.siteId === pagetree.siteId) &&
        (!r.pagetreeType || r.pagetreeType === pagetree.type)
      ) return true
    }
    return false
  }

  async mayRename (pagetree: Pagetree) {
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    return await this.haveSitePerm(site!, 'manageState')
  }

  async mayDelete (pagetree: Pagetree) {
    if (pagetree.deleted) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    return await this.haveSitePerm(site!, 'manageState')
  }

  async mayUndelete (pagetree: Pagetree) {
    if (!pagetree.deleted) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    return await this.haveSitePerm(site!, 'manageState')
  }

  async mayPromote (pagetree: Pagetree) {
    if (pagetree.type === PagetreeType.PRIMARY) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    return await this.haveSitePerm(site!, 'manageState')
  }

  async mayArchive (pagetree: Pagetree) {
    if (pagetree.type === PagetreeType.ARCHIVE) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    return await this.haveSitePerm(site!, 'manageState')
  }
}
