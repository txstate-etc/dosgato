import { BaseService, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { isNotBlank, isNotNull, someAsync, unique, isBlank } from 'txstate-utils'
import {
  DosGatoService, GroupService, User, type UserFilter, UserResponse, getUsers, createUser,
  getUsersInGroup, getUsersWithRole, getUsersBySite, getUsersByInternalId, UsersResponse,
  type UpdateUserInput, updateUser, disableUsers, enableUsers, getUsersManagingGroups, SiteRuleService, getTrainingsForUsers, addTrainings
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

const trainingsByUserInternalIdLoader = new ManyJoinedLoader({
  fetch: async (userInternalIds: number[]) => await getTrainingsForUsers(userInternalIds)
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
      const usersFromGroups = unique(result.flat())
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

  async getTrainings (id: number) {
    return await this.loaders.get(trainingsByUserInternalIdLoader).load(id)
  }
}

export class UserService extends DosGatoService<User, User> {
  raw = this.svc(UserServiceInternal)

  async find (filter: UserFilter) {
    if (!this.mayList()) filter.ids = ['self']
    if (filter.ids?.length) {
      filter.ids = filter.ids.map(id => id === 'self' ? this.login : id).filter(isNotBlank)
    }
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findByGroupId (groupId: string, direct?: boolean, filter?: UserFilter) {
    const users = await this.raw.findByGroupId(groupId, direct, filter)
    if (this.haveGlobalPerm('manageAccess')) return users
    return users.filter(u => u.id === this.login)
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: UserFilter) {
    const users = await this.raw.findByRoleId(roleId, direct, filter)
    if (this.haveGlobalPerm('manageAccess')) return users
    return users.filter(u => u.id === this.login)
  }

  async findSiteManagers (siteId: string) {
    if (this.ctx.authInfo.siteRules.some(sr => SiteRuleService.applies(sr, siteId) && sr.grants.governance)) {
      return this.removeUnauthorized(await this.raw.findSiteManagers(siteId))
    }
    return []
  }

  async findGroupManagers (groupId: string, direct?: boolean) {
      const users = await this.raw.findGroupManagers(groupId, direct)
      if (this.haveGlobalPerm('manageAccess')) return users
      return users.filter(u => u.id === this.login)
    }

  async findByInternalId (id: number) {
    return this.removeUnauthorized(await this.raw.findByInternalId(id))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async createUser (id: string, lastname: string, email: string, firstname: string | undefined, trainings: string[] | undefined, system: boolean | undefined, validateOnly?: boolean) {
    if (!this.mayCreate()) throw new Error('You are not permitted to create users.')
    const response = new UserResponse({ success: true })
    const existing = await this.raw.findById(id)
    if (existing) response.addMessage('Login is already present, update the user instead.', 'userId', MutationMessageType.error)
    if (isBlank(lastname)) response.addMessage(`${system ? 'Name is required' : 'Last name is required'}`, 'lastname')
    if (isBlank(email)) response.addMessage('E-mail address is required.', 'email')
    if (!/^\s*[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}\s*$/i.test(email)) {
      response.addMessage('Please enter a valid email address.', 'email')
    }
    if (validateOnly || response.hasErrors()) return response
    await createUser(id, firstname ?? '', lastname, email, trainings, !!system)
    this.loaders.clear()
    response.user = await this.raw.findById(id)
    return response
  }

  async updateUser (id: string, args: UpdateUserInput, validateOnly?: boolean) {
    const user = await this.raw.findById(id)
    if (!user) throw new Error('User to be updated does not exist.')
    if (!this.mayUpdate(user)) throw new Error('You are not permitted to update this user.')
    const response = new UserResponse({ success: true })
    if (isNotNull(args.lastname) && isBlank(args.lastname)) {
      response.addMessage('This field is required', 'args.lastname')
    }
    if (isNotNull(args.email)) {
      if (isBlank(args.email)) {
        response.addMessage('This field is required', 'args.email')
      }
      if (!args.email.match(/^\s*[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}\s*$/i)) {
        response.addMessage('Please enter a valid email address', 'args.email')
      }
    }
    if (response.hasErrors()) return response
    if (!validateOnly) {
      await updateUser(id, args.firstname, args.lastname, args.email, args.trainings)
      this.loaders.clear()
      response.success = true
      response.user = await this.raw.findById(id)
    }
    return response
  }

  async addTrainings (trainingId: string, userIds: string[]) {
    if (!this.haveGlobalPerm('manageAccess')) throw new Error('You are not permitted to add trainings.')
    await addTrainings(trainingId, userIds.filter(isNotBlank))
    return new ValidatedResponse({ success: true })
  }

  async disableUsers (ids: string[]) {
    const users = (await Promise.all(ids.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (users.some(u => !this.mayDisable(u))) {
      throw new Error('You are not permitted to disable one or more users.')
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
    if (!this.mayCreate()) {
      throw new Error('You are not permitted to enable users.')
    }
    const response = new UsersResponse({})
    await enableUsers(users)
    this.loaders.clear()
    response.success = true
    response.users = await this.raw.find({ internalIds: users.map(u => u.internalId) })
    return response
  }

  mayCreate () {
    return this.haveGlobalPerm('manageAccess')
  }

  mayUpdate (user: User) {
    return this.haveGlobalPerm('manageAccess')
  }

  mayDisable (user: User) {
    return this.haveGlobalPerm('manageAccess')
  }

  mayView (user: User) {
    return true
  }

  mayList () {
    return this.haveGlobalPerm('manageAccess')
  }

  protected removeProperties (user: User) {
    if (user.id === this.login || this.mayList()) return user
    return new User({
      id: user.internalId,
      login: user.id,
      system: user.system,
      firstname: user.firstname,
      lastname: user.lastname
    })
  }
}
