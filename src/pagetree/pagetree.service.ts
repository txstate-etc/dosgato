import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { PageData } from '@dosgato/templating'
import { nanoid } from 'nanoid'
import {
  Pagetree, PagetreeFilter, getPagetreesById, getPagetreesBySite, renamePagetree,
  getPagetreesByTemplate, SiteService, DosGatoService, PagetreeType, PagetreeResponse,
  promotePagetree, createPagetree, VersionedService, deletePagetree,
  undeletePagetree, archivePagetree, SiteServiceInternal, PageService
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
  fetch: async (templateIds: number[], direct?: boolean) => {
    return await getPagetreesByTemplate(templateIds, direct)
  },
  idLoader: PagetreesByIdLoader
})

export class PagetreeServiceInternal extends BaseService {
  async findById (id: string) {
    return await this.loaders.get(PagetreesByIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }
}

export class PagetreeService extends DosGatoService<Pagetree> {
  raw = this.svc(PagetreeServiceInternal)

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByTemplateId(templateId, direct))
  }

  async create (siteId: string, name: string, data: PageData, validateOnly?: boolean) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Pagetree site does not exist.')
    if (!(await this.svc(SiteService).mayManageState(site))) {
      throw new Error('Current user is not permitted to create pagetrees in this site.')
    }
    const currentPagetrees = await this.raw.findBySiteId(siteId)
    const response = new PagetreeResponse({ success: true })
    if (currentPagetrees.some(p => p.name === name)) {
      response.addMessage(`Site ${site.name} already has a pagetree with name ${name}.`, 'name')
    }
    // validate root page data
    const linkId = nanoid(10)
    const pageValidationResponse = await this.svc(PageService).validatePageData(data, site, undefined, undefined, site.name, linkId)
    if (pageValidationResponse.hasErrors()) {
      // take these errors and add them to the pagetree response
      for (const message of pageValidationResponse.messages) {
        response.addMessage(message.message, message.arg ? `data.${message.arg}` : undefined, message.type)
      }
    }
    if (response.hasErrors()) return response
    if (!validateOnly) {
      const versionedService = this.svc(VersionedService)
      const currentUser = await this.currentUser()
      const pagetree = await createPagetree(versionedService, currentUser!, site, name, data, linkId)
      this.loaders.clear()
      response.pagetree = pagetree
    }
    return response
  }

  async rename (pagetreeId: string, name: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be renamed does not exist.')
    if (!(await this.mayRename(pagetree))) throw new Error('Current user is not permitted to rename this pagetree.')
    const response = new PagetreeResponse({})
    try {
      await renamePagetree(pagetreeId, name)
      this.loaders.clear()
      response.success = true
      response.pagetree = await this.raw.findById(pagetreeId)
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        response.addMessage(`Pagetree with name ${name} already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while renaming the pagetree.')
    }
    return response
  }

  async delete (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be deleted does not exist.')
    if (!(await this.mayDelete(pagetree))) throw new Error('Current user is not permitted to delete this pagetree.')
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('Cannot delete primary pagetree')
    const currentUser = await this.currentUser()
    try {
      await deletePagetree(pagetreeId, currentUser!.internalId)
      this.loaders.clear()
      const deletedPagetree = await this.raw.findById(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: deletedPagetree })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while deleting the pagetree.')
    }
  }

  async undelete (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be restored does not exist.')
    if (!(await this.mayUndelete(pagetree))) throw new Error('Current user is not permitted to restore this pagetree.')
    try {
      await undeletePagetree(pagetreeId)
      this.loaders.clear()
      const restoredPagetree = await this.raw.findById(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: restoredPagetree })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while restoring the pagetree')
    }
  }

  async promote (pagetreeId: string) {
    const pagetree = await this.raw.findById(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be promoted does not exist.')
    if (!(await this.mayPromote(pagetree))) throw new Error('Current user is not permitted to promote this pagetree.')
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const currentPrimaryPagetree = await this.raw.findById(site.primaryPagetreeId)
    try {
      await promotePagetree(currentPrimaryPagetree!.id, pagetreeId)
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
      await archivePagetree(pagetreeId)
      this.loaders.clear()
      const updated = await this.raw.findById(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while archiving the pagetree.')
    }
  }

  async mayView (pagetree: Pagetree) {
    if (pagetree.type === PagetreeType.PRIMARY && this.isRenderServer()) return true
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) return false
    if (pagetree.type === PagetreeType.PRIMARY) return true
    return await this.haveSitePerm(site, 'viewForEdit')
  }

  async mayRename (pagetree: Pagetree) {
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'manageState')
  }

  async mayDelete (pagetree: Pagetree) {
    if (pagetree.deleted) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'manageState')
  }

  async mayUndelete (pagetree: Pagetree) {
    if (!pagetree.deleted) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'manageState')
  }

  async mayPromote (pagetree: Pagetree) {
    // TODO: It says to return false if the pagetree is live. Do we need to check if the site is launched too?
    if (pagetree.type === PagetreeType.PRIMARY) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'manageState')
  }

  async mayArchive (pagetree: Pagetree) {
    if (pagetree.type === PagetreeType.ARCHIVE) return false
    const site = await this.svc(SiteServiceInternal).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'manageState')
  }
}
