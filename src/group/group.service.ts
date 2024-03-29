import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique, isNotNull, mapConcurrent } from 'txstate-utils'
import {
  type Group, type GroupFilter, GroupResponse, getGroups, getGroupsWithUser, getGroupsWithRole,
  groupHierarchyCache, createGroup, updateGroup, deleteGroup,
  addUserToGroups, removeUserFromGroups, removeSubgroup, addSubgroup, groupNameIsUnique,
  UserService, DosGatoService, setUserGroups, setGroupUsers
} from '../internal.js'

const groupsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getGroups({ ids })
  }
})

const groupsByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[]) => {
    return await getGroupsWithUser(userIds)
  },
  idLoader: groupsByIdLoader
})

const groupsByRoleIdLoader = new ManyJoinedLoader({
  fetch: async (roleIds: string[], filter?: GroupFilter) => {
    return await getGroupsWithRole(roleIds, filter)
  },
  idLoader: groupsByIdLoader
})

export class GroupServiceInternal extends BaseService {
  async find (filter?: GroupFilter) {
    const groups = await getGroups(filter)
    for (const group of groups) this.loaders.get(groupsByIdLoader).prime(group.id, group)
    return groups
  }

  async findById (id: string) {
    return await this.loaders.get(groupsByIdLoader).load(id)
  }

  async findByUserId (userId: string, direct?: boolean) {
    const directGroups = await this.loaders.get(groupsByUserIdLoader).load(userId)
    let ret = directGroups
    if (!direct) {
      const directGroupIds = directGroups.map(d => d.id)
      const indirectGroups = await this.getAllSupers(directGroupIds)
      if (typeof direct === 'undefined') {
        ret = unique([...directGroups, ...indirectGroups], 'id')
      } else {
        ret = indirectGroups
      }
    }
    return ret
  }

  async getSubgroups (groupId: string, recursive: boolean = true) {
    const groupMap = await groupHierarchyCache.get()
    const group = groupMap[groupId]
    if (!group) return []
    const subgroups = recursive
      ? Array.from(group.descendantIds()).map(id => groupMap[id])
      : group.children as Group[]
    return subgroups
  }

  async getAllSubs (groupIds: string[]) {
    return unique((await Promise.all(groupIds.map(async id => await this.getSubgroups(id)))).flat(), 'id')
  }

  async getSuperGroups (groupId: string, recursive = true) {
    const groupMap = await groupHierarchyCache.get()
    const group = groupMap[groupId]
    if (!group) return []
    const supergroups = recursive
      ? Array.from(group.ancestorIds()).map(id => groupMap[id])
      : group.parents as Group[]
    return supergroups
  }

  async getAllSupers (groupIds: string[]) {
    return unique((await Promise.all(groupIds.map(async id => await this.getSuperGroups(id)))).flat(), 'id')
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: GroupFilter) {
    let ret: Group[]
    if (direct) {
      ret = await this.loaders.get(groupsByRoleIdLoader, filter).load(roleId)
    } else {
      // need to get all of the groups and subgroups and THEN filter them
      const groups = await this.loaders.get(groupsByRoleIdLoader).load(roleId)
      const subgroups = await this.getAllSubs(groups.map(g => g.id))
      ret = (typeof direct === 'undefined') ? unique([...groups, ...subgroups], 'id') : subgroups
      if (filter?.ids?.length) {
        const lookingFor = new Set(filter.ids)
        ret = ret.filter(sg => lookingFor.has(sg.id))
      }
    }
    return ret
  }
}

export class GroupService extends DosGatoService<Group> {
  raw = this.svc(GroupServiceInternal)

  async find (filter?: GroupFilter) {
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByUserId (userId: string, direct?: boolean) {
    return this.removeUnauthorized(await this.raw.findByUserId(userId, direct))
  }

  async getSubgroups (groupId: string, recursive: boolean = true) {
    return this.removeUnauthorized(await this.raw.getSubgroups(groupId, recursive))
  }

  async getAllSubs (groupIds: string[]) {
    return this.removeUnauthorized(await this.raw.getAllSubs(groupIds))
  }

  async getSuperGroups (groupId: string, recursive = true) {
    return this.removeUnauthorized(await this.raw.getSuperGroups(groupId, recursive))
  }

  async getAllSupers (groupIds: string[]) {
    return this.removeUnauthorized(await this.raw.getAllSupers(groupIds))
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: GroupFilter) {
    return this.removeUnauthorized(await this.raw.findByRoleId(roleId, direct, filter))
  }

  async create (name: string, parentId?: string, validateOnly?: boolean) {
    let parentGroup: Group | undefined
    if (parentId) {
      parentGroup = await this.findById(parentId)
      if (!parentGroup) throw new Error('Parent group does not exist.')
    }
    if (!this.mayCreate()) throw new Error('You are not permitted to create groups.')
    if (!(await groupNameIsUnique(name))) {
      const response = new GroupResponse({})
      response.addMessage(`Group ${name} already exists.`, 'name')
      return response
    } else {
      if (validateOnly) {
        return new GroupResponse({ success: true, messages: [] })
      } else {
        const groupId = await createGroup(name, parentGroup)
        await groupHierarchyCache.clear()
        const newGroup = await this.loaders.get(groupsByIdLoader).load(String(groupId))
        return new GroupResponse({ success: true, group: newGroup })
      }
    }
  }

  async update (id: string, name: string, validateOnly?: boolean) {
    const group = await this.findById(id)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!this.mayUpdate(group)) throw new Error('You are not permitted to update group names.')
    const response = new GroupResponse({ success: true })
    if (name !== group.name && !(await groupNameIsUnique(name))) {
      response.addMessage(`Group ${name} already exists.`, 'name')
    }
    if (validateOnly || response.hasErrors()) return response
    await updateGroup(id, name)
    await groupHierarchyCache.clear()
    this.loaders.clear()
    response.group = await this.loaders.get(groupsByIdLoader).load(id)
    return response
  }

  async delete (id: string) {
    const group = await this.findById(id)
    if (!group) throw new Error('Group to be deleted does not exist.')
    if (!this.mayDelete(group)) throw new Error('You are not permitted to delete groups.')
    try {
      await deleteGroup(id)
      await groupHierarchyCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while attempting to delete group ${group.name}.`)
    }
  }

  async addUserToGroups (groupIds: string[], userId: string) {
    const groups = (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (groups.some(g => !this.mayManageUsers(g))) {
      throw new Error('You are not permitted to add user to one or more groups.')
    }
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot add user who does not exist.')
    try {
      await addUserToGroups(groups.map(g => g.id), user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to add user to one or more groups.')
    }
  }

  async removeUserFromGroup (groupIds: string[], userId: string) {
    const groups = (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (groups.some(g => !this.mayManageUsers(g))) {
      throw new Error('You are not permitted to remove user from one or more groups.')
    }
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot add user who does not exist.')
    try {
      const removed = await removeUserFromGroups(groupIds, user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to remove user from one or more groups.')
    }
  }

  async setUserGroups (userId: string, groupIds: string[]) {
    const groups = (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (groups.some(g => !this.mayManageUsers(g))) {
      throw new Error('You are not permitted to manage users for one or more groups.')
    }
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot update group membership for user who does not exist')
    try {
      await setUserGroups(user.internalId, groupIds)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`Unable to update group memberships for user ${user.id}`)
    }
  }

  async setGroupUsers (groupId: string, userIds: string[]) {
    const group = await this.findById(groupId)
    if (!group) throw new Error('Group to be deleted does not exist.')
    if (!this.mayManageUsers(group)) {
      throw new Error('You are not permitted to manage users for this group.')
    }
    const users = (await mapConcurrent(userIds, async (id) => await this.svc(UserService).findById(id))).filter(isNotNull)
    if (!users.length) throw new Error('Cannot assign user(s) to group')
    await setGroupUsers(group.id, users.map(u => u.internalId))
    return new ValidatedResponse({ success: true })
  }

  async addSubgroup (parentId: string, childId: string) {
    const [parentGroup, childGroup] = await Promise.all([
      this.findById(parentId),
      this.findById(childId)
    ])
    if (!parentGroup) throw new Error('Group to be updated does not exist.')
    if (!childGroup) throw new Error('Group to be added as a subgroup does not exist.')
    if (!this.mayManageGroups(parentGroup)) throw new Error(`You are not permitted add a subgroup to group ${parentGroup.name}.`)
    try {
      await addSubgroup(parentId, childId)
      await groupHierarchyCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while adding a subgroup to group ${parentGroup.name}.`)
    }
  }

  async removeSubgroup (parentId: string, childId: string) {
    const [parentGroup, childGroup] = await Promise.all([
      this.findById(parentId),
      this.findById(childId)
    ])
    if (!parentGroup) throw new Error('Group to be updated does not exist.')
    if (!childGroup) throw new Error('Group to be added as a subgroup does not exist.')
    if (!this.mayManageGroups(parentGroup)) throw new Error(`You are not permitted remove subgroups from group ${parentGroup.name}.`)
    try {
      const removed = await removeSubgroup(parentId, childId)
      if (removed) {
        await groupHierarchyCache.clear()
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage(`Cannot remove non-existent subgroup relationship. ${childGroup.name} is not a subgroup of ${parentGroup.name}.`)
        return response
      }
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while removing subgroup ${childGroup.name} from group ${parentGroup.name}.`)
    }
  }

  mayView (group: Group) {
    if (this.haveGlobalPerm('manageAccess')) return true
    return !!this.ctx.authInfo.groupsById[group.id]
  }

  mayViewManagerUI () {
    return this.haveGlobalPerm('manageAccess')
  }

  mayCreate () {
    return this.haveGlobalPerm('manageAccess')
  }

  mayUpdate (group: Group) {
    return this.haveGlobalPerm('manageAccess')
  }

  mayDelete (group: Group) {
    return this.haveGlobalPerm('manageAccess')
  }

  mayManageUsers (group: Group) {
    return this.haveGlobalPerm('manageAccess')
  }

  mayManageGroups (group: Group) {
    return this.haveGlobalPerm('manageAccess')
  }
}
