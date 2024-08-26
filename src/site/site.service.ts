import { type PageExtras, type PageData } from '@dosgato/templating'
import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import { nanoid } from 'nanoid'
import { isBlank, isNotBlank } from 'txstate-utils'
import {
  type Site, type SiteFilter, getSites, getSitesByTemplate, undeleteSite, DosGatoService,
  createSite, VersionedService, SiteResponse, deleteSite, PageService,
  getSitesByManagerInternalId, siteNameIsUnique, renameSite, setLaunchURL,
  type UpdateSiteManagementInput, updateSiteManagement, DeletedFilter,
  type CreatePageExtras, getSiteIdByLaunchUrl, type Organization,
  PagetreeServiceInternal, migratePage, systemContext, LaunchState
} from '../internal.js'

const sitesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSites({ ids, deleted: DeletedFilter.SHOW })
  }
})

const sitesByNameLoader = new PrimaryKeyLoader({
  fetch: async (names: string[]) => {
    return await getSites({ names, deleted: DeletedFilter.SHOW })
  },
  extractId: site => site.name,
  idLoader: sitesByIdLoader
})
sitesByIdLoader.addIdLoader(sitesByNameLoader)

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (organizationIds: string[], filter?: SiteFilter) => {
    return await getSites({ ...filter, organizationIds })
  },
  extractKey: (item: Site) => item.organizationId!,
  idLoader: [sitesByIdLoader, sitesByNameLoader]
})

// TODO: does this loader need a filter parameter too? Without it, deleted
// sites will be returned too
const sitesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: string[], atLeastOneTree?: boolean) => {
    return await getSitesByTemplate(templateIds, atLeastOneTree)
  },
  idLoader: [sitesByIdLoader, sitesByNameLoader]
})

const sitesByOwnerInternalIdLoader = new OneToManyLoader({
  fetch: async (ownerInternalIds: number[], filter?: SiteFilter) => {
    return await getSites({ ...filter, ownerInternalIds })
  },
  extractKey: (item: Site) => item.ownerId!,
  idLoader: [sitesByIdLoader, sitesByNameLoader]
})

const sitesByManagerInternalIdLoader = new ManyJoinedLoader({
  fetch: async (managerInternalIds: number[], filter?: SiteFilter) => {
    return await getSitesByManagerInternalId(managerInternalIds, filter)
  },
  idLoader: [sitesByIdLoader, sitesByNameLoader]
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

  async findByName (siteName: string) {
    return await this.loaders.get(sitesByNameLoader).load(siteName)
  }

  async findByOrganization (org: Organization, filter?: SiteFilter) {
    return await this.loaders.get(siteByOrganizationIdLoader, filter).load(org.id)
  }

  async findByTemplateId (templateId: string, atLeastOneTree?: boolean) {
    return await this.loaders.get(sitesByTemplateIdLoader, atLeastOneTree).load(templateId)
  }

  async findByPagetreeId (pagetreeId: string) {
    const pagetree = await this.svc(PagetreeServiceInternal).findById(pagetreeId)
    if (!pagetree) return undefined
    return await this.findById(pagetree.siteId)
  }

  async findByOwnerInternalId (ownerInternalId: number, filter?: SiteFilter) {
    return await this.loaders.get(sitesByOwnerInternalIdLoader, filter).load(ownerInternalId)
  }

  async findByManagerInternalId (managerInternalId: number, filter?: SiteFilter) {
    return await this.loaders.get(sitesByManagerInternalIdLoader, filter).load(managerInternalId)
  }

  async findByLaunchUrl (launchUrl: string) {
    const id = await getSiteIdByLaunchUrl(launchUrl)
    return id ? await this.findById(id) : undefined
  }
}

export class SiteService extends DosGatoService<Site> {
  raw = this.svc(SiteServiceInternal)

  postFilter (sites: Site[], filter?: SiteFilter) {
    return filter?.viewForEdit ? sites.filter(s => this.mayViewForEdit(s)) : sites
  }

  async find (filter?: SiteFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.find(filter)), filter)
  }

  async findById (siteId: string) {
    return this.removeUnauthorized(await this.raw.findById(siteId))
  }

  async findByOrganization (org: Organization, filter?: SiteFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByOrganization(org, filter)), filter)
  }

  async findByTemplateId (templateId: string, atLeastOneTree?: boolean) {
    return this.removeUnauthorized(await this.raw.findByTemplateId(templateId, atLeastOneTree))
  }

  async findByPagetreeId (pagetreeId: string) {
    return this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId))
  }

  async findByOwnerInternalId (ownerInternalId: number, filter?: SiteFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByOwnerInternalId(ownerInternalId, filter)), filter)
  }

  async findByManagerInternalId (managerInternalId: number, filter?: SiteFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByManagerInternalId(managerInternalId, filter)), filter)
  }

  async create (name: string, data: PageData, validateOnly?: boolean, extra?: CreatePageExtras) {
    if (!this.mayCreate()) throw new Error('You are not permitted to create sites.')
    const response = new SiteResponse({ success: true })
    if (!(await siteNameIsUnique(name))) {
      response.addMessage(`Site ${name} already exists.`, 'name')
    }
    // validate root page data
    const linkId = extra?.linkId ?? nanoid(10)
    const extras: PageExtras = {
      query: systemContext().query,
      pagePath: `/${name}`,
      name,
      linkId,
      page: undefined
    }
    const migrated = await migratePage(data, extras)
    const pageValidationResponse = await this.svc(PageService).validatePageData(migrated, extras)
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
      response.site = await createSite(versionedService, this.login, name, migrated, extra)
    }
    return response
  }

  async rename (siteId: string, name: string, validateOnly: boolean = false) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be renamed does not exist.')
    if (!this.mayRename(site)) throw new Error('You are not authorized to rename this site')
    const response = new SiteResponse({ success: true })
    if (name !== site.name && !(await siteNameIsUnique(name))) {
      response.addMessage(`Site ${name} already exists.`, 'name')
    }
    if (response.hasErrors()) {
      return response
    }
    if (!validateOnly) {
      await renameSite(site, name, this.ctx.authInfo.user!.internalId)
      this.loaders.clear()
      response.site = await this.raw.findById(siteId)
    }
    return response
  }

  async setLaunchURL (siteId: string, host: string | undefined, path: string | undefined, enabled = LaunchState.PRELAUNCH, validateOnly = false) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site does not exist')
    if (!this.mayLaunch(site)) throw new Error('You are not authorized to update the public URL for this site')
    const response = new SiteResponse({ success: true })
    if (isBlank(host) && enabled === LaunchState.LAUNCHED) {
      response.addMessage('A site with no host cannot be live.', 'enabled')
    }
    if (isNotBlank(host)) {
      host = host.replace(/^https?:\/\//i, '').toLocaleLowerCase()
    }
    if (isNotBlank(path)) {
      path = (path.startsWith('/') ? '' : '/') + path + (path.endsWith('/') ? '' : '/')
      path = path.toLocaleLowerCase()
    }
    if (validateOnly || response.hasErrors()) return response
    await setLaunchURL(site, host, path, enabled, this.ctx.authInfo.user!.internalId)
    this.loaders.clear()
    response.site = await this.raw.findById(siteId)
    return response
  }

  async updateSiteManagement (siteId: string, args: UpdateSiteManagementInput, validateOnly?: boolean) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site does not exist')
    if (!this.mayManageGovernance(site)) throw new Error('You are not authorized to update the organization, owner, or managers for this site')
    const response = new SiteResponse({ success: true })
    // TODO: Any validations needed?
    if (!validateOnly) {
      await updateSiteManagement(site, args, this.ctx.authInfo.user!.internalId)
      this.loaders.clear()
      response.site = await this.raw.findById(siteId)
    }
    return response
  }

  async delete (siteId: string) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site to be deleted does not exist.')
    if (!this.mayDelete(site)) throw new Error('You are not permitted to delete this site.')
    try {
      await deleteSite(site, this.ctx.authInfo.user!.internalId)
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
    if (!this.mayUndelete(site)) throw new Error('You are not permitted to restore this site.')
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

  mayView (site: Site) {
    if (this.mayViewForEdit(site)) return true
    // visible if any page in the site is visible
    return this.ctx.authInfo.pageRules.some(r => r.grants.viewForEdit && (!r.siteId || r.siteId === site.id))
  }

  mayViewForEdit (site: { id: string }) {
    return this.haveGlobalPerm('manageAccess') || this.haveSitePerm(site, 'viewForEdit')
  }

  mayViewManagerUI () {
    if (this.haveGlobalPerm('createSites')) return true
    return this.ctx.authInfo.siteRules.some(r => r.grants.viewForEdit)
  }

  mayCreate () {
    return this.haveGlobalPerm('createSites')
  }

  mayLaunch (site: Site) {
    return this.haveSitePerm(site, 'launch')
  }

  mayRename (site: Site) {
    return this.haveSitePerm(site, 'rename')
  }

  mayManageGovernance (site: Site) {
    return this.haveSitePerm(site, 'governance')
  }

  mayManageState (site: Site) {
    return this.haveSitePerm(site, 'manageState')
  }

  mayDelete (site: Site) {
    return this.haveSitePerm(site, 'delete')
  }

  mayUndelete (site: Site) {
    return this.haveSitePerm(site, 'delete')
  }
}
