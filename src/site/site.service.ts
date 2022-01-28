import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import {
  Site, SiteFilter, getSites, getSitesByOrganization, getSitesByTemplate,
  PagetreeService, DosGatoService, CreateSiteInput
} from 'internal'

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: string[]) => {
    return await getSitesByOrganization(orgIds)
  },
  extractKey: (item: Site) => item.organizationId!
})

const sitesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSites({ ids })
  }
})

const sitesByAssetRootLoader = new PrimaryKeyLoader({
  fetch: async (assetRootIds: number[]) => {
    return await getSites({ assetRootIds })
  },
  extractId: site => site.rootAssetFolderInternalId
})

const sitesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], atLeastOneTree?: boolean) => {
    return await getSitesByTemplate(templateIds, atLeastOneTree)
  }
})

export class SiteService extends DosGatoService {
  async find (filter?: SiteFilter) {
    const sites = await getSites(filter)
    for (const site of sites) {
      this.loaders.get(sitesByIdLoader).prime(site.id, site)
    }
    return sites
  }

  async findById (siteId: string) {
    return await this.loaders.get(sitesByIdLoader).load(siteId)
  }

  async findByOrganization (orgId: string) {
    return await this.loaders.get(siteByOrganizationIdLoader).load(orgId)
  }

  async findByTemplateId (templateId: number, atLeastOneTree?: boolean) {
    return await this.loaders.get(sitesByTemplateIdLoader, atLeastOneTree).load(templateId)
  }

  async findByPagetreeId (pagetreeId: string) {
    const pagetree = await this.svc(PagetreeService).findById(pagetreeId)
    if (!pagetree) return undefined
    return await this.findById(pagetree.siteId)
  }

  async findByAssetRootId (assetFolderId: number) {
    return await this.loaders.get(sitesByAssetRootLoader).load(assetFolderId)
  }

  // async create (args: CreateSiteInput) {
  //   if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create sites.')
  // }

  async mayView (): Promise<boolean> {
    return true
  }

  async mayViewManagerUI () {
    return (await this.currentSiteRules()).some(r => r.grants.viewForEdit)
  }

  async mayCreate () {
    return await this.haveGlobalPerm('createSites')
  }

  async mayLaunch (site: Site) {
    return await this.haveSitePerm(site, 'launch')
  }

  async mayRename (site: Site) {
    return await this.haveSitePerm(site, 'rename')
  }

  async mayManageOwners (site: Site) {
    return await this.haveSitePerm(site, 'manageOwners')
  }

  async mayManagePagetrees (site: Site) {
    return await this.haveSitePerm(site, 'managePagetrees')
  }

  async mayPromotePagetree (site: Site) {
    return await this.haveSitePerm(site, 'promotePagetree')
  }

  async mayDelete (site: Site) {
    return await this.haveSitePerm(site, 'delete')
  }

  async mayUndelete (site: Site) {
    return await this.haveSitePerm(site, 'undelete')
  }
}
