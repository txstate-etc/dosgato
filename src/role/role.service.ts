import { AuthorizedService } from '@txstate-mws/graphql-server'
import { RoleFilter } from './role.model'
import { getRoles } from './role.database'
import { unique } from 'txstate-utils'

export class RoleService extends AuthorizedService {
  async find (filter: RoleFilter) {
    const roles = await getRoles(filter)
    return unique(roles)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
