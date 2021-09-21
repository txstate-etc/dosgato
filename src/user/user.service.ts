import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { User, UserFilter } from './user.model'
import { getUsers, getUsersInGroup, getUsersWithRole, getUsersBySite, getUsersByInternalId } from './user.database'
import { GroupService } from '../group'
import { unique } from 'txstate-utils'

const usersByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[], filter?: UserFilter) => {
    return await getUsersInGroup(groupIds, filter)
  }
})

const usersByRoleIdLoader = new ManyJoinedLoader({
  fetch: async (roleIds: string[], filter?: UserFilter) => {
    return await getUsersWithRole(roleIds, filter)
  }
})

const usersBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[]) => {
    return await getUsersBySite(siteIds)
  }
})

const usersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getUsersByInternalId(ids)
  },
  extractId: (item: User) => item.internalId
})

export class UserService extends AuthorizedService<User> {
  async find (filter: UserFilter) {
    if (filter.ids?.length) {
      const index = filter.ids?.indexOf('self')
      if (index > -1) filter.ids[index] = 'su01' // get this from ctx.auth
    }
    return await getUsers(filter)
  }

  async findByGroupId (groupId: string, direct?: boolean, filter?: UserFilter) {
    const users = await this.loaders.get(usersByGroupIdLoader, filter).load(groupId)
    if (typeof direct !== 'undefined' && direct) {
      return users
    } else {
      const subgroups = await this.svc(GroupService).getSubgroups(groupId)
      const result = await Promise.all(
        subgroups.map(async sg => {
          return await this.loaders.get(usersByGroupIdLoader, filter).load(sg.id)
        })
      )
      const subgroupUsers = unique(result.flat())
      if (typeof direct === 'undefined') {
        return unique([...users, ...subgroupUsers])
      } else {
        return subgroupUsers
      }
    }
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: UserFilter) {
    // get the users who have this role directly
    const users = await this.loaders.get(usersByRoleIdLoader, filter).load(roleId)
    if (typeof direct !== 'undefined' && direct) {
      return users
    } else {
      // get the users who have this role indirectly through a group
      // need the groups that have this role
      const groupsWithThisRole = await this.svc(GroupService).findByRoleId(roleId, true)
      // then, the users in those groups and their subgroups (which also have this role)
      const result = await Promise.all(
        groupsWithThisRole.map(async g => {
          return await this.findByGroupId(g.id, undefined, filter)
        })
      )
      const usersFromGroups = unique(result.flat())
      if (typeof direct === 'undefined') {
        return unique([...users, ...usersFromGroups])
      } else {
        return usersFromGroups
      }
    }
  }

  async findSiteManagers (siteId: string) {
    return await this.loaders.get(usersBySiteIdLoader).load(siteId)
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(usersByInternalIdLoader).load(id)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
