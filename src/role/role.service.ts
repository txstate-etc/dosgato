import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { RoleFilter } from './role.model'
import { getRoles, getRolesWithGroup } from './role.database'
import { unique } from 'txstate-utils'
import { GroupService } from '../group'

const rolesByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[]) => {
    return await getRolesWithGroup(groupIds)
  }
})

export class RoleService extends AuthorizedService {
  async find (filter: RoleFilter) {
    const roles = await getRoles(filter)
    return unique(roles)
  }

  async getRolesByGroup (groupId: string, direct?: boolean) {
    const roles = await this.loaders.get(rolesByGroupIdLoader).load(groupId)
    if (typeof direct !== 'undefined' && direct) {
      return roles
    } else {
      // get parent groups
      const parentGroups = await this.svc(GroupService).getSuperGroups(groupId)
      // get the roles for those groups
      const result = await Promise.all(
        parentGroups.map(async pg => {
          return await this.loaders.get(rolesByGroupIdLoader).load(pg.id)
        })
      )
      const parentGroupRoles = unique(result.flat())
      if (typeof direct === 'undefined') {
        return unique([...roles, ...parentGroupRoles])
      } else {
        return parentGroupRoles
      }
    }
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
