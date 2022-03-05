import { AuthorizedService, BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { getOrganizations, Organization, SiteService } from 'internal'

const organizationsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getOrganizations(ids)
  }
})

export class OrganizationServiceInternal extends BaseService {
  async find (ids?: string[]) {
    const orgs = await getOrganizations(ids)
    for (const org of orgs) this.loaders.get(organizationsByIdLoader).prime(org.id, org)
    return orgs
  }

  async findById (id: string) {
    return await this.loaders.get(organizationsByIdLoader).load(id)
  }
}

export class OrganizationService extends AuthorizedService<Organization> {
  raw = this.svc(OrganizationServiceInternal)

  async find (ids?: string[]) {
    return await this.removeUnauthorized(await this.raw.find(ids))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async mayView (org: Organization) {
    return await this.svc(SiteService).mayViewManagerUI()
  }
}
