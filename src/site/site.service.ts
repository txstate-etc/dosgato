import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Site, SiteFilter } from './site.model'
import { getSites, getSitesByOrganization } from './site.database'

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: string[]) => {
    return await getSitesByOrganization(orgIds)
  },
  extractKey: (item: Site) => String(item.organizationId)
})

export class SiteService extends AuthorizedService<Site> {
  async find (filter?: SiteFilter) {
    return await getSites(filter)
  }

  async findByOrganization (orgId: string) {
    return await this.loaders.get(siteByOrganizationIdLoader).load(orgId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
