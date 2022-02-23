import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  Pagetree, PagetreeFilter, getPagetreesById, getPagetreesBySite, renamePagetree,
  getPagetreesByTemplate, SiteService, DosGatoService, PagetreeType, PagetreeResponse,
  promotePagetree, createPagetree, CreatePagetreeInput, VersionedService, deletePagetree,
  undeletePagetree, archivePagetree
} from 'internal'

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

export class PagetreeService extends DosGatoService {
  async findById (id: string) {
    return await this.loaders.get(PagetreesByIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }

  async create (args: CreatePagetreeInput) {
    const site = await this.svc(SiteService).findById(args.siteId)
    if (!site) throw new Error('Pagetree site does not exist.')
    const currentPagetrees = await this.findBySiteId(args.siteId)
    if (!(await this.svc(SiteService).mayManagePagetrees(site))) {
      throw new Error('Current user is not permitted to create pagetrees in this site.')
    }
    if (currentPagetrees.some(p => p.name === args.name)) {
      return ValidatedResponse.error(`Site ${site.name} already has a pagetree with name ${args.name}.`, 'name')
    }
    try {
      const versionedService = this.svc(VersionedService)
      const pagetree = await createPagetree(versionedService, this.auth!.login, site.name, args)
      this.loaders.clear()
      return new PagetreeResponse({ pagetree, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not create pagetree')
    }
  }

  async rename (pagetreeId: string, name: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be renamed does not exist.')
    if (!(await this.mayRename(pagetree))) throw new Error('Current user is not permitted to rename this pagetree.')
    const response = new PagetreeResponse({})
    try {
      await renamePagetree(pagetreeId, name)
      this.loaders.clear()
      const updated = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      response.success = true
      response.pagetree = updated
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
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be deleted does not exist.')
    if (!(await this.mayDelete(pagetree))) throw new Error('Current user is not permitted to delete this pagetree.')
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('Cannot delete primary pagetree')
    const currentUser = await this.currentUser()
    try {
      await deletePagetree(pagetreeId, currentUser!.internalId)
      this.loaders.clear()
      const deletedPagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: deletedPagetree })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while deleting the pagetree.')
    }
  }

  async undelete (pagetreeId: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be restored does not exist.')
    if (!(await this.mayUndelete(pagetree))) throw new Error('Current user is not permitted to restore this pagetree.')
    try {
      await undeletePagetree(pagetreeId)
      this.loaders.clear()
      const restoredPagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: restoredPagetree })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while restoring the pagetree')
    }
  }

  async promote (pagetreeId: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be promoted does not exist.')
    if (!(await this.mayPromote(pagetree))) throw new Error('Current user is not permitted to promote this pagetree.')
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    const currentPrimaryPagetree = await this.loaders.get(PagetreesByIdLoader).load(site!.primaryPagetreeId)
    try {
      await promotePagetree(currentPrimaryPagetree!.id, pagetreeId)
      this.loaders.clear()
      const updated = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while promoting the pagetree.')
    }
  }

  async archive (pagetreeId: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be archived does not exist.')
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('Primary pagetree cannot be archived')
    if (!(await this.mayArchive(pagetree))) throw new Error('Current user is not permitted to archive this pagetree.')
    try {
      await archivePagetree(pagetreeId)
      this.loaders.clear()
      const updated = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while archiving the pagetree.')
    }
  }

  async mayView (pagetree: Pagetree) {
    return true
  }

  async mayRename (pagetree: Pagetree) {
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayDelete (pagetree: Pagetree) {
    if (pagetree.deleted) return false
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayUndelete (pagetree: Pagetree) {
    if (!pagetree.deleted) return false
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayPromote (pagetree: Pagetree) {
    // TODO: It says to return false if the pagetree is live. Do we need to check if the site is launched too?
    if (pagetree.type === PagetreeType.PRIMARY) return false
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'promotePagetree')
  }

  async mayArchive (pagetree: Pagetree) {
    if (pagetree.type === PagetreeType.ARCHIVE) return false
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }
}
