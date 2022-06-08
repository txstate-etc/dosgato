import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import {
  Site, SiteFilter, getSites, getSitesByOrganization, getSitesByTemplate, getSitesByGroupIds, undeleteSite,
  PagetreeService, DosGatoService, CreateSiteInput, createSite, VersionedService, SiteResponse, UpdateSiteInput,
  updateSite, deleteSite, PageService, Group, getSitesByOwnerInternalId, getSitesByManagerInternalId
} from '../internal.js'

const sitesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSites({ ids })
  }
})

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: string[]) => {
    return await getSitesByOrganization(orgIds)
  },
  extractKey: (item: Site) => item.organizationId!,
  idLoader: sitesByIdLoader
})

const sitesByAssetRootLoader = new PrimaryKeyLoader({
  fetch: async (assetRootIds: number[]) => {
    return await getSites({ assetRootIds })
  },
  extractId: site => site.rootAssetFolderInternalId,
  idLoader: sitesByIdLoader
})

const sitesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], atLeastOneTree?: boolean) => {
    return await getSitesByTemplate(templateIds, atLeastOneTree)
  },
  idLoader: sitesByIdLoader
})

const sitesByGroupLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[]) => {
    return await getSitesByGroupIds(groupIds)
  },
  idLoader: sitesByIdLoader
})

const sitesByOwnerInternalIdLoader = new OneToManyLoader({
  fetch: async (ownerInternalIds: number[]) => {
    return await getSitesByOwnerInternalId(ownerInternalIds)
  },
  extractKey: (item: Site) => item.ownerId!,
  idLoader: sitesByIdLoader
})

const sitesByManagerInternalIdLoader = new ManyJoinedLoader({
  fetch: async (managerInternalIds: number[]) => {
    return await getSitesByManagerInternalId(managerInternalIds)
  },
  idLoader: sitesByIdLoader
})

export class SiteServiceInternal extends BaseService {
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

  async findByGroup (group: Group) {
    return await this.loaders.get(sitesByGroupLoader).load(group.id)
  }

  async findByPagetreeId (pagetreeId: string) {
    const pagetree = await this.svc(PagetreeService).findById(pagetreeId)
    if (!pagetree) return undefined
    return await this.findById(pagetree.siteId)
  }

  async findByAssetRootId (assetFolderId: number) {
    return await this.loaders.get(sitesByAssetRootLoader).load(assetFolderId)
  }

  async findByOwnerInternalId (ownerInternalId: number) {
    return await this.loaders.get(sitesByOwnerInternalIdLoader).load(ownerInternalId)
  }

  async findByManagerInternalId (managerInternalId: number) {
    return await this.loaders.get(sitesByManagerInternalIdLoader).load(managerInternalId)
  }
}

export class SiteService extends DosGatoService<Site> {
  raw = this.svc(SiteServiceInternal)

  async find (filter?: SiteFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (siteId: string) {
    return await this.removeUnauthorized(await this.raw.findById(siteId))
  }

  async findByOrganization (orgId: string) {
    return await this.removeUnauthorized(await this.raw.findByOrganization(orgId))
  }

  async findByTemplateId (templateId: number, atLeastOneTree?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByTemplateId(templateId, atLeastOneTree))
  }

  async findByGroup (group: Group) {
    return await this.removeUnauthorized(await this.raw.findByGroup(group))
  }

  async findByPagetreeId (pagetreeId: string) {
    return await this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId))
  }

  async findByAssetRootId (assetFolderId: number) {
    return await this.removeUnauthorized(await this.raw.findByAssetRootId(assetFolderId))
  }

  async findByOwnerInternalId (ownerInternalId: number) {
    return await this.removeUnauthorized(await this.raw.findByOwnerInternalId(ownerInternalId))
  }

  async findByManagerInternalId (managerInternalId: number) {
    return await this.removeUnauthorized(await this.raw.findByManagerInternalId (managerInternalId))
  }

  async create (args: CreateSiteInput) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create sites.')
    try {
      const versionedService = this.svc(VersionedService)
      const site = await createSite(versionedService, this.login, args)
      return new SiteResponse({ success: true, site })
    } catch (err: any) {
      console.error(err)
      if (err.code === 'ER_DUP_ENTRY') {
        const response = new SiteResponse({})
        response.addMessage(`Site ${args.name} already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while creating the site.')
    }
  }

  async update (siteId: string, args: UpdateSiteInput) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be updated does not exist.')
    if (args.name && !(await this.mayRename(site))) throw new Error('Current user is not authorized to rename this site')
    if ((args.ownerId ?? args.organizationId ?? args.managerIds?.length) && !(await this.mayManageOwners(site))) throw new Error('Current user is not authorized to update the organization, owner, or managers for this site')
    if ((args.launchHost ?? args.launchPath) && !(await this.mayLaunch(site))) throw new Error('Current user is not authorized to update the public URL for this site')
    try {
      await updateSite(site, args)
      this.loaders.clear()
      const updatedSite = await this.raw.findById(siteId)
      return new SiteResponse({ success: true, site: updatedSite })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the site')
    }
  }

  async delete (siteId: string) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be deleted does not exist.')
    if (!(await this.mayDelete(site))) throw new Error('Current user is not permitted to delete this site.')
    const currentUser = await this.currentUser()
    try {
      await deleteSite(site, currentUser!.internalId)
      this.loaders.clear()
      const deletedSite = await this.raw.findById(siteId)
      return new SiteResponse({ success: true, site: deletedSite })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while deleting the site')
    }
  }

  async undelete (siteId: string) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be restored does not exist.')
    if (!(await this.mayUndelete(site))) throw new Error('Current user is not permitted to restore this site.')
    try {
      await undeleteSite(site)
      this.loaders.clear()
      const restoredSite = await this.raw.findById(siteId)
      return new SiteResponse({ success: true, site: restoredSite })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while restoring the site')
    }
  }

  async mayView (site: Site) {
    // if site is launched then any authenticated user may view it, along with anonymous renders
    if (site.url != null) return this.isRenderServer() || await this.svc(PageService).mayViewManagerUI()
    return await this.haveSitePerm(site, 'viewForEdit')
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
