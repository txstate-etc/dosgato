import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { createOrganization, DosGatoService, getOrganizations, type Organization, type OrganizationFilter, OrganizationResponse, SiteService } from '../internal.js'
import { isNotNull } from 'txstate-utils'

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

  protected async findAncestorsRecursive (orgId: string | undefined): Promise<Organization[]> {
    if (!orgId) return []
    const parent = await this.findById(orgId)
    if (!parent) return []
    return [parent, ...(await this.findAncestorsRecursive(parent.id))]
  }

  async findAncestors (orgId: string, topDown?: boolean, indexes?: number[]): Promise<Organization[]> {
    const ancestors = await this.findAncestorsRecursive(orgId)
    if (topDown) ancestors.reverse()
    if (!indexes || indexes.length === 0) return ancestors
    return indexes.map(i => ancestors[i]).filter(isNotNull)
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

  async findAncestors (orgId: string, topDown?: boolean, indexes?: number[]): Promise<Organization[]> {
    const ancestors = await this.raw.findAncestors(orgId, topDown, indexes)
    return this.removeUnauthorized(ancestors)
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
