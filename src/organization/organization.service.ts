import { AuthorizedService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { getOrganizations } from 'internal'

const organizationsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getOrganizations(ids)
  }
})

export class OrganizationService extends AuthorizedService {
  async find (ids?: string[]) {
    return await getOrganizations(ids)
  }

  async findById (id: string) {
    return await this.loaders.get(organizationsByIdLoader).load(id)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
