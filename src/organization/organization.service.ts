import { AuthorizedService } from '@txstate-mws/graphql-server'
import { getOrganizations } from './organization.database'

export class OrganizationService extends AuthorizedService {
  async find (ids?: string[]) {
    return await getOrganizations(ids)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
