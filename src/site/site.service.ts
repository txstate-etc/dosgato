import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader, ManyJoinedLoader } from 'dataloader-factory'
import { Site, SiteFilter } from './site.model'
import { getSites, getSitesByOrganization, getSitesByTemplate } from './site.database'
import { PagetreeService } from '../pagetree'

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

const sitesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], atLeastOneTree?: boolean) => {
    return await getSitesByTemplate(templateIds, atLeastOneTree)
  }
})

export class SiteService extends AuthorizedService<Site> {
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

  async mayView (): Promise<boolean> {
    return true
  }
}
