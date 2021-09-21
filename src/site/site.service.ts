import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Site, SiteFilter } from './site.model'
import { getSites, getSitesByOrganization } from './site.database'

const siteByOrganizationIdLoader = new OneToManyLoader({
  fetch: async (orgIds: number[]) => {
    return await getSitesByOrganization(orgIds)
  },
  extractKey: (item: Site) => item.organizationId!
})

export class SiteService extends AuthorizedService<Site> {
  async find (filter?: SiteFilter) {
    return await getSites(filter)
  }

  async findByOrganization (orgId: string) {
    return await this.loaders.get(siteByOrganizationIdLoader).load(Number(orgId))
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
