import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Site, SiteFilter } from './site.model'
import { getSites, getSitesByOrganization } from './site.database'

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: number[]) => {
    return await getSitesByOrganization(orgIds)
  },
  extractKey: (item: Site) => item.organizationId!
})

const sitesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSites({ ids })
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
    return await this.loaders.get(siteByOrganizationIdLoader).load(Number(orgId))
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
