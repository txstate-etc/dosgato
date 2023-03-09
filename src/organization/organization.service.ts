import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { createOrganization, DosGatoService, getOrganizations, Organization, SiteService } from '../internal.js'

const organizationsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getOrganizations({ ids })
  },
  extractId: org => org.id
})

const organizationsByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getOrganizations({ internalIds })
  },
  extractId: org => org.internalId,
  idLoader: organizationsByIdLoader
})
organizationsByIdLoader.addIdLoader(organizationsByInternalIdLoader)

export class OrganizationServiceInternal extends BaseService {
  async find (ids?: string[]) {
    const orgs = await getOrganizations({ ids })
    for (const org of orgs) this.loaders.get(organizationsByIdLoader).prime(org.id, org)
    return orgs
  }

  async findById (id: string) {
    return await this.loaders.get(organizationsByIdLoader).load(id)
  }

  async findByInternalId (id: number | undefined) {
    if (id == null) return undefined
    return await this.loaders.get(organizationsByInternalIdLoader).load(id)
  }
}

export class OrganizationService extends DosGatoService<Organization> {
  raw = this.svc(OrganizationServiceInternal)

  async find (ids?: string[]) {
    return await this.removeUnauthorized(await this.raw.find(ids))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByInternalId (id: number | undefined) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(id))
  }

  async mayView (org: Organization) {
    return await this.svc(SiteService).mayViewManagerUI()
  }

  async mayCreate () {
    return (await this.currentSiteRules()).some(r => r.grants.governance)
  }

  async create (name: string, id?: string) {
    const internalId = await createOrganization(name, id)
    return await this.raw.findByInternalId(internalId)
  }
}
