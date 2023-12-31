import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { createOrganization, DosGatoService, getOrganizations, type Organization, type OrganizationFilter, OrganizationResponse, SiteService } from '../internal.js'

const organizationsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getOrganizations({ ids })
  },
  extractId: org => org.id
})

export class OrganizationServiceInternal extends BaseService {
  async find (filter?: OrganizationFilter) {
    const orgs = await getOrganizations(filter)
    const orgByIdLoader = this.loaders.get(organizationsByIdLoader)
    for (const org of orgs) orgByIdLoader.prime(org.id, org)
    return orgs
  }

  async findById (id: string) {
    return await this.loaders.get(organizationsByIdLoader).load(id)
  }
}

export class OrganizationService extends DosGatoService<Organization> {
  raw = this.svc(OrganizationServiceInternal)

  async find (filter?: OrganizationFilter) {
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  mayView (org: Organization) {
    return this.svc(SiteService).mayViewManagerUI()
  }

  mayCreate () {
    return this.ctx.authInfo.siteRules.some(r => r.grants.governance)
  }

  async create (name: string, externalId?: string) {
    if (!this.mayCreate()) throw new Error('You are not permitted to create organizations.')
    const internalId = await createOrganization(name, externalId)
    return new OrganizationResponse({ success: true, organization: await this.raw.findById(String(internalId)) })
  }
}
