import { PageData } from '@dosgato/templating'
import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import { nanoid } from 'nanoid'
import { isNotNull } from 'txstate-utils'
import {
  Site, SiteFilter, getSites, getSitesByTemplate, undeleteSite,
  PagetreeService, DosGatoService, createSite, VersionedService, SiteResponse,
  deleteSite, PageService, getSitesByManagerInternalId, siteNameIsUnique,
  renameSite, setLaunchURL, UpdateSiteManagementInput, updateSiteManagement, DeletedFilter
} from '../internal.js'

const sitesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSites({ ids, deleted: DeletedFilter.SHOW })
  }
})

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: string[], filter?: SiteFilter) => {
    return await getSites({ ...filter, organizationIds: orgIds })
  },
  extractKey: (item: Site) => item.organizationId!,
  idLoader: sitesByIdLoader
})

const sitesByAssetRootLoader = new PrimaryKeyLoader({
  fetch: async (assetRootIds: number[]) => {
    return await getSites({ assetRootIds, deleted: DeletedFilter.SHOW })
  },
  extractId: site => site.rootAssetFolderInternalId,
  idLoader: sitesByIdLoader
})

// TODO: does this loader need a filter parameter too? Without it, deleted
// sites will be returned too
const sitesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], atLeastOneTree?: boolean) => {
    return await getSitesByTemplate(templateIds, atLeastOneTree)
  },
  idLoader: sitesByIdLoader
})

const sitesByOwnerInternalIdLoader = new OneToManyLoader({
  fetch: async (ownerInternalIds: number[], filter?: SiteFilter) => {
    return await getSites({ ...filter, ownerInternalIds })
  },
  extractKey: (item: Site) => item.ownerId!,
  idLoader: sitesByIdLoader
})

const sitesByManagerInternalIdLoader = new ManyJoinedLoader({
  fetch: async (managerInternalIds: number[], filter?: SiteFilter) => {
    return await getSitesByManagerInternalId(managerInternalIds, filter)
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

  async findByOrganization (orgId: string, filter?: SiteFilter) {
    return await this.loaders.get(siteByOrganizationIdLoader, filter).load(orgId)
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

  async findByOwnerInternalId (ownerInternalId: number, filter?: SiteFilter) {
    return await this.loaders.get(sitesByOwnerInternalIdLoader, filter).load(ownerInternalId)
  }

  async findByManagerInternalId (managerInternalId: number, filter?: SiteFilter) {
    return await this.loaders.get(sitesByManagerInternalIdLoader, filter).load(managerInternalId)
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

  async findByOrganization (orgId: string, filter?: SiteFilter) {
    return await this.removeUnauthorized(await this.raw.findByOrganization(orgId, filter))
  }

  async findByTemplateId (templateId: number, atLeastOneTree?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByTemplateId(templateId, atLeastOneTree))
  }

  async findByPagetreeId (pagetreeId: string) {
    return await this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId))
  }

  async findByAssetRootId (assetFolderId: number) {
    return await this.removeUnauthorized(await this.raw.findByAssetRootId(assetFolderId))
  }

  async findByOwnerInternalId (ownerInternalId: number, filter?: SiteFilter) {
    return await this.removeUnauthorized(await this.raw.findByOwnerInternalId(ownerInternalId, filter))
  }

  async findByManagerInternalId (managerInternalId: number, filter?: SiteFilter) {
    return await this.removeUnauthorized(await this.raw.findByManagerInternalId(managerInternalId, filter))
  }

  async create (name: string, data: PageData, validateOnly?: boolean) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create sites.')
    const response = new SiteResponse({ success: true })
    if (!(await siteNameIsUnique(name))) {
      response.addMessage(`Site ${name} already exists.`, 'name')
    }
    // validate root page data
    const linkId = nanoid(10)
    const pageValidationResponse = await this.svc(PageService).validatePageData(data, undefined, undefined, undefined, name, linkId)
    if (pageValidationResponse.hasErrors()) {
      // take these errors and add them to the site response
      for (const message of pageValidationResponse.messages) {
        response.addMessage(message.message, message.arg ? `data.${message.arg}` : undefined, message.type)
      }
    }
    if (response.hasErrors()) {
      return response
    }
    if (!validateOnly) {
      const versionedService = this.svc(VersionedService)
      response.site = await createSite(versionedService, this.login, name, data, linkId)
    }
    return response
  }

  async rename (siteId: string, name: string, validateOnly: boolean = false) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be renamed does not exist.')
    if (!(await this.mayRename(site))) throw new Error('Current user is not authorized to rename this site')
    const response = new SiteResponse({ success: true })
    if (name !== site.name && !(await siteNameIsUnique(name))) {
      response.addMessage(`Site ${name} already exists.`, 'name')
    }
    if (response.hasErrors()) {
      return response
    }
    if (!validateOnly) {
      const currentUser = await this.currentUser()
      await renameSite(site, name, currentUser!.internalId)
      this.loaders.clear()
      response.site = await this.raw.findById(siteId)
    }
    return response
  }

  async setLaunchURL (siteId: string, host: string | undefined, path: string | undefined, enabled: boolean, validateOnly: boolean = false) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site does not exist')
    if (!(await this.mayLaunch(site))) throw new Error('Current user is not authorized to update the public URL for this site')
    const response = new SiteResponse({ success: true })
    // TODO: What other validation is needed? Host and path are not required. What if they enter a path but no host?
    if (isNotNull(host)) {
      host = host.replace(/^https?:\/\//i, '')
    }
    if (isNotNull(path)) {
      path = (path.startsWith('/') ? '' : '/') + path + (path.endsWith('/') ? '' : '/')
    }
    if (!validateOnly) {
      const currentUser = await this.currentUser()
      await setLaunchURL(site, host, path, enabled, currentUser!.internalId)
      this.loaders.clear()
      response.site = await this.raw.findById(siteId)
    }
    return response
  }

  async updateSiteManagement (siteId: string, args: UpdateSiteManagementInput, validateOnly?: boolean) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site does not exist')
    if (!(await this.mayManageGovernance(site))) throw new Error('Current user is not authorized to update the organization, owner, or managers for this site')
    const response = new SiteResponse({ success: true })
    // TODO: Any validations needed?
    if (!validateOnly) {
      const currentUser = await this.currentUser()
      await updateSiteManagement(site, args, currentUser!.internalId)
      this.loaders.clear()
      response.site = await this.raw.findById(siteId)
    }
    return response
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

  async mayViewSiteList () {
    return await this.haveGlobalPerm('viewSiteList')
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

  async mayManageGovernance (site: Site) {
    return await this.haveSitePerm(site, 'governance')
  }

  async mayManageState (site: Site) {
    return await this.haveSitePerm(site, 'manageState')
  }

  async mayDelete (site: Site) {
    return await this.haveSitePerm(site, 'delete')
  }

  async mayUndelete (site: Site) {
    return await this.haveSitePerm(site, 'delete')
  }
}
