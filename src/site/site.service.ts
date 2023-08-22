import { type PageExtras, type PageData } from '@dosgato/templating'
import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import { nanoid } from 'nanoid'
import { filterAsync, isBlank, isNotBlank } from 'txstate-utils'
import {
  type Site, type SiteFilter, getSites, getSitesByTemplate, undeleteSite, DosGatoService,
  createSite, VersionedService, SiteResponse, deleteSite, PageService,
  getSitesByManagerInternalId, siteNameIsUnique, renameSite, setLaunchURL,
  type UpdateSiteManagementInput, updateSiteManagement, DeletedFilter,
  type CreatePageExtras, getSiteIdByLaunchUrl, type Organization, PageServiceInternal,
  PagetreeServiceInternal, migratePage, systemContext
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

  async postFilter (sites: Site[], filter?: SiteFilter) {
    return filter?.viewForEdit ? await filterAsync(sites, async s => await this.mayViewForEdit(s)) : sites
  }

  async find (filter?: SiteFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.find(filter)), filter)
  }

  async findById (siteId: string) {
    return await this.removeUnauthorized(await this.raw.findById(siteId))
  }

  async findByOrganization (org: Organization, filter?: SiteFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.findByOrganization(org, filter)), filter)
  }

  async findByTemplateId (templateId: string, atLeastOneTree?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByTemplateId(templateId, atLeastOneTree))
  }

  async findByPagetreeId (pagetreeId: string) {
    return await this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId))
  }

  async findByOwnerInternalId (ownerInternalId: number, filter?: SiteFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.findByOwnerInternalId(ownerInternalId, filter)), filter)
  }

  async findByManagerInternalId (managerInternalId: number, filter?: SiteFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.findByManagerInternalId(managerInternalId, filter)), filter)
  }

  async create (name: string, data: PageData, validateOnly?: boolean, extra?: CreatePageExtras) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create sites.')
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
      linkId
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

  async setLaunchURL (siteId: string, host: string | undefined, path: string | undefined, enabled = true, validateOnly = false) {
    const site = await this.raw.findById(siteId)
    if (!site) throw new Error('Site does not exist')
    if (!(await this.mayLaunch(site))) throw new Error('Current user is not authorized to update the public URL for this site')
    const response = new SiteResponse({ success: true })
    if (isBlank(host) && enabled) {
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
    const currentUser = await this.currentUser()
    await setLaunchURL(site, host, path, enabled, currentUser!.internalId)
    this.loaders.clear()
    response.site = await this.raw.findById(siteId)
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
    const [viewForEdit, pages] = await Promise.all([
      this.mayViewForEdit(site),
      this.svc(PageServiceInternal).findByPagetreeId(site.primaryPagetreeId, { maxDepth: 0 })
    ])
    if (viewForEdit) return true
    return await this.havePagePerm(pages[0]!, 'viewForEdit')
  }

  async mayViewForEdit (site: Site) {
    return await this.haveSitePerm(site, 'viewForEdit')
  }

  async mayViewManagerUI () {
    if (await this.haveGlobalPerm('createSites')) return true
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
