import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  Pagetree, PagetreeFilter, getPagetreesById, getPagetreesBySite, renamePagetree,
  getPagetreesByTemplate, SiteService, DosGatoService, PagetreeType, PagetreeResponse,
  promotePagetree,
  Page
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

  async renamePagetree (pagetreeId: string, name: string) {
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

  async deletePagetree (pagetreeId: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be deleted does not exist.')
    if (!(await this.mayDelete(pagetree))) throw new Error('Current user is not permitted to delete this pagetree.')
    // TODO: The pages in this pagetree should be deleted as well. Do we need to check if the current user has
    // permission to delete the pages?
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('Cannot delete primary pagetree')
    // TODO: Pagetrees might be referenced in the pagetrees_templates table and the pagerules table. Should the entries
    // in those tables be deleted? It would be a hard delete, so the undelete Mutation would not completely restore the
    // pagetree to its pre-deleted state.
  }

  async promotePagetree (pagetreeId: string) {
    const pagetree = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
    if (!pagetree) throw new Error('Pagetree to be promoted does not exist.')
    if (!(await this.mayPromote(pagetree))) throw new Error('Current user is not permitted to promote this pagetree.')
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    const currentPrimaryPagetree = await this.loaders.get(PagetreesByIdLoader).load(site!.primaryPagetreeId)
    try {
      await promotePagetree(currentPrimaryPagetree!.id, pagetreeId)
      const updated = await this.loaders.get(PagetreesByIdLoader).load(pagetreeId)
      return new PagetreeResponse({ success: true, pagetree: updated })
    } catch (err: any) {
      throw new Error('An unknown error occurred while promoting the pagetree.')
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
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayUndelete (pagetree: Pagetree) {
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayPromote (pagetree: Pagetree) {
    const site = await this.svc(SiteService).findById(pagetree.siteId)
    if (!site) {
      throw new Error(`Site not found for pagetree ${pagetree.name}`)
    }
    return await this.haveSitePerm(site, 'promotePagetree')
  }
}
