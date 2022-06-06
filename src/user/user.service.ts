
import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { isNotBlank, isNotNull, someAsync, unique } from 'txstate-utils'
import {
  DosGatoService, GroupService, User, UserFilter, UserResponse, getUsers,
  getUsersInGroup, getUsersWithRole, getUsersBySite, getUsersByInternalId, RedactedUser, UsersResponse,
  UpdateUserInput, updateUser, disableUsers, enableUsers, getUsersManagingGroups
} from '../internal.js'

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

const usersManagingGroupId = new ManyJoinedLoader({
  fetch: async (groupIds: string[], direct?: boolean) => await getUsersManagingGroups(groupIds, direct),
  idLoader: usersByInternalIdLoader
})

export class UserServiceInternal extends BaseService {
  async find (filter: UserFilter) {
    const users = await getUsers(filter)
    for (const user of users) {
      this.loaders.get(usersByIdLoader).prime(user.id, user)
      this.loaders.get(usersByInternalIdLoader).prime(user.internalId, user)
    }
    return users
  }

  async findByGroupId (groupId: string, direct?: boolean, filter?: UserFilter) {
    let users = await this.loaders.get(usersByGroupIdLoader, filter).load(groupId)
    if (!direct) {
      const subgroups = await this.svc(GroupService).getSubgroups(groupId)
      const result = await Promise.all(
        subgroups.map(async sg => {
          return await this.loaders.get(usersByGroupIdLoader, filter).load(sg.id)
        })
      )
      const subgroupUsers = unique(result.flat())
      if (typeof direct === 'undefined') {
        users = unique([...users, ...subgroupUsers])
      } else {
        users = subgroupUsers
      }
    }
    return users
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: UserFilter) {
    // get the users who have this role directly
    let users = await this.loaders.get(usersByRoleIdLoader, filter).load(roleId)
    if (!direct) {
      // get the users who have this role indirectly through a group
      // need the groups that have this role
      const groupsWithThisRole = await this.svc(GroupService).findByRoleId(roleId, true)
      // then, the users in those groups and their subgroups (which also have this role)
      const result = await Promise.all(
        groupsWithThisRole.map(async g => {
          return await this.findByGroupId(g.id, undefined, filter)
        })
      )
      const usersFromGroups = await unique(result.flat())
      if (typeof direct === 'undefined') {
        users = unique([...users, ...usersFromGroups])
      } else {
        users = usersFromGroups
      }
    }
    return users
  }

  async findSiteManagers (siteId: string) {
    return await this.loaders.get(usersBySiteIdLoader).load(siteId)
  }

  async findGroupManagers (groupId: string, direct?: boolean) {
    return await this.loaders.get(usersManagingGroupId, direct).load(groupId)
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(usersByInternalIdLoader).load(id)
  }

  async findById (id: string) {
    return await this.loaders.get(usersByIdLoader).load(id)
  }
}

export class UserService extends DosGatoService<User, RedactedUser|User> {
  raw = this.svc(UserServiceInternal)

  async find (filter: UserFilter) {
    if (!(await this.haveGlobalPerm('manageUsers'))) filter.ids = ['self']
    if (filter.ids?.length) {
      filter.ids = filter.ids.map(id => id === 'self' ? this.login : id).filter(isNotBlank)
    }
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findByGroupId (groupId: string, direct?: boolean, filter?: UserFilter) {
    return await this.removeUnauthorized(await this.raw.findByGroupId(groupId, direct, filter))
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: UserFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, direct, filter))
  }

  async findSiteManagers (siteId: string) {
    return await this.removeUnauthorized(await this.raw.findSiteManagers(siteId))
  }

  async findGroupManagers (groupId: string, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findGroupManagers(groupId, direct))
  }

  async findByInternalId (id: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(id))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async updateUser (id: string, args: UpdateUserInput) {
    const user = await this.raw.findById(id)
    if (!user) throw new Error('User to be updated does not exist.')
    if (!(await this.mayUpdate(user))) throw new Error('Current user is not permitted to update this user.')
    const response = new UserResponse({})
    try {
      await updateUser(id, args.name, args.email)
      this.loaders.clear()
      response.success = true
      response.user = await this.raw.findById(id)
    } catch (err: any) {
      throw new Error('An unknown error occurred while updating the user.')
    }
    return response
  }

  async disableUsers (ids: string[]) {
    const users = (await Promise.all(ids.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(users, async u => !(await this.mayDisable(u)))) {
      throw new Error('Current user is not permitted to disable one or more users.')
    }
    const response = new UsersResponse({})
    await disableUsers(users)
    this.loaders.clear()
    response.success = true
    response.users = await this.raw.find({ internalIds: users.map(u => u.internalId) })
    return response
  }

  async enableUsers (ids: string[]) {
    const users = (await Promise.all(ids.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (!(await this.mayCreate())) {
      throw new Error('You are not permitted to enable users.')
    }
    const response = new UsersResponse({})
    await enableUsers(users)
    this.loaders.clear()
    response.success = true
    response.users = await this.raw.find({ internalIds: users.map(u => u.internalId) })
    return response
  }

  async mayCreate () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayUpdate (user: User) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayDisable (user: User) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayView (user: User) {
    const currentUser = await this.currentUser()
    return currentUser != null
  }

  protected async removeProperties (user: User) {
    const currentUser = await this.currentUser()
    if (user.id === currentUser!.id || await this.haveGlobalPerm('manageUsers')) return user
    return {
      id: user.id,
      internalId: user.internalId,
      name: user.name
    } as RedactedUser
  }
}
