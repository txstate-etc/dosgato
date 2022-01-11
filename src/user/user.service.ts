
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique } from 'txstate-utils'
import {
  DosGatoService, GroupService, User, UserFilter, UserResponse, getUsers,
  getUsersInGroup, getUsersWithRole, getUsersBySite, getUsersByInternalId,
  UpdateUserInput, updateUser, disableUser
} from 'internal'

const usersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getUsersByInternalId(ids)
  },
  extractId: (item: User) => item.internalId
})

const usersByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getUsers({ ids })
  }
})

const usersByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[], filter?: UserFilter) => {
    return await getUsersInGroup(groupIds, filter)
  },
  idLoader: usersByInternalIdLoader
})

const usersByRoleIdLoader = new ManyJoinedLoader({
  fetch: async (roleIds: string[], filter?: UserFilter) => {
    return await getUsersWithRole(roleIds, filter)
  },
  idLoader: usersByInternalIdLoader
})

const usersBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[]) => {
    return await getUsersBySite(siteIds)
  },
  idLoader: usersByInternalIdLoader
})

export class UserService extends DosGatoService {
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

  async findById (id: string) {
    return await this.loaders.get(usersByIdLoader).load(id)
  }

  async updateUser (id: string, args: UpdateUserInput) {
    const user = await this.findById(id)
    if (!user) throw new Error('User to be updated does not exist.')
    if (!(await this.mayUpdate())) throw new Error('Current user is not permitted to update users.')
    const response = new UserResponse({})
    try {
      await updateUser(id, args.name, args.email)
      this.loaders.clear()
      const updated = await this.loaders.get(usersByIdLoader).load(id)
      response.success = true
      response.user = updated
    } catch (err: any) {
      throw new Error('An unknown error occurred while updating the user.')
    }
    return response
  }

  async disableUser (id: string) {
    const user = await this.findById(id)
    if (!user) throw new Error('User to be disabled does not exist.')
    if (!(await this.mayDisable())) throw new Error('Current user is not permitted to disable users.')
    const response = new UserResponse({})
    try {
      await disableUser(user.internalId)
      this.loaders.clear()
      const updated = await this.loaders.get(usersByIdLoader).load(id)
      response.success = true
      response.user = updated
    } catch (err: any) {
      throw new Error('An unknown error occurred while disabling the user.')
    }
    return response
  }

  async mayUpdate () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayDisable () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayView (): Promise<boolean> {
    return await this.haveGlobalPerm('manageUsers')
  }
}
