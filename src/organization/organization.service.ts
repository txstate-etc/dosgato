import { AuthorizedService } from '@txstate-mws/graphql-server'
import { getOrganizations } from './organization.database'

export class OrganizationService extends AuthorizedService {
  async find () {
    return await getOrganizations()
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
