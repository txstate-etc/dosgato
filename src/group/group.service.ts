import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique, filterConcurrent } from 'txstate-utils'
import {
  Group, GroupFilter, GroupResponse, getGroups, getGroupsWithUser, getGroupsWithRole,
  groupManagerCache, groupHierarchyCache, createGroup, updateGroup, deleteGroup,
  addUserToGroup, removeUserFromGroup, setGroupManager, removeSubgroup, addSubgroup,
  UserService, DosGatoService, UserServiceInternal
} from 'internal'

const groupsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getGroups({ ids })
  }
})

const groupsByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[], filters?: { manager: boolean }) => {
    return await getGroupsWithUser(userIds, filters)
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

  async findByManagerId (managerId: string) {
    return await this.loaders.get(groupsByUserIdLoader, { manager: true }).load(managerId)
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
      if (filter?.managerIds?.length) {
        const lookingFor = new Set(filter.managerIds)
        ret = await filterConcurrent(ret, async (sg) => {
          const managers = await this.getGroupManagers(sg.id)
          return managers.some(manager => lookingFor.has(manager.id))
        })
      }
    }
    return ret
  }

  async getGroupManagers (groupId: string) {
    const managerIds = await groupManagerCache.get(groupId)
    if (managerIds.length) return await this.svc(UserServiceInternal).find({ internalIds: managerIds })
    else return []
  }
}

export class GroupService extends DosGatoService<Group> {
  raw = this.svc(GroupServiceInternal)

  async find (filter?: GroupFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByUserId (userId: string, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByUserId(userId, direct))
  }

  async findByManagerId (managerId: string) {
    return await this.removeUnauthorized(await this.raw.findByManagerId(managerId))
  }

  async getSubgroups (groupId: string, recursive: boolean = true) {
    return await this.removeUnauthorized(await this.raw.getSubgroups(groupId, recursive))
  }

  async getAllSubs (groupIds: string[]) {
    return await this.removeUnauthorized(await this.raw.getAllSubs(groupIds))
  }

  async getSuperGroups (groupId: string, recursive = true) {
    return await this.removeUnauthorized(await this.raw.getSuperGroups(groupId, recursive))
  }

  async getAllSupers (groupIds: string[]) {
    return await this.removeUnauthorized(await this.raw.getAllSupers(groupIds))
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: GroupFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, direct, filter))
  }

  async getGroupManagers (groupId: string) {
    return await this.svc(UserService).removeUnauthorized(await this.raw.getGroupManagers(groupId))
  }

  async create (name: string) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create groups.')
    const response = new GroupResponse({})
    try {
      const groupId = await createGroup(name)
      await groupHierarchyCache.clear()
      const newGroup = await this.loaders.get(groupsByIdLoader).load(String(groupId))
      response.success = true
      response.group = newGroup
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        response.addMessage(`Group ${name} already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while creating the group.')
    }
    return response
  }

  async update (id: string, name: string) {
    const group = await this.findById(id)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayUpdate(group))) throw new Error('Current user is not permitted to update group names.')
    const response = new GroupResponse({})
    try {
      await updateGroup(id, name)
      await groupHierarchyCache.clear()
      this.loaders.clear()
      const updated = await this.loaders.get(groupsByIdLoader).load(id)
      response.success = true
      response.group = updated
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        response.addMessage(`Group ${name} already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while updating the group name.')
    }
    return response
  }

  async delete (id: string) {
    const group = await this.findById(id)
    if (!group) throw new Error('Group to be deleted does not exist.')
    if (!(await this.mayDelete(group))) throw new Error('Current user is not permitted to delete groups.')
    try {
      await deleteGroup(id)
      await groupHierarchyCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while deleting the group.')
    }
  }

  async addUserToGroup (groupId: string, userId: string) {
    const group = await this.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayManageUsers(group))) throw new Error('Current user is not permitted to add users to groups.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot add user who does not exist')
    try {
      await addUserToGroup(groupId, user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      // TODO: Should the error message specify which user and/or which group?
      throw new Error('An unknown error occurred while trying to add a user to a group')
    }
  }

  async removeUserFromGroup (groupId: string, userId: string) {
    const group = await this.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayManageUsers(group))) throw new Error('Current user is not permitted to remove users from groups.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot remove user who does not exist')
    try {
      const removed = await removeUserFromGroup(groupId, user.internalId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage('user is not a group member')
        return response
      }
    } catch (err: any) {
      // TODO: Should the error message specify which user and/or which group?
      console.log(err)
      throw new Error('An unknown error occurred while trying to remove a user from a group')
    }
  }

  async setGroupManager (groupId: string, userId: string, manager: boolean) {
    const group = await this.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayManageUsers(group))) throw new Error('Current user is not permitted add or remove group managers.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('User does not exist')
    try {
      const updated = await setGroupManager(groupId, user.internalId, manager)
      if (updated) {
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage('user is not a group member')
        return response
      }
    } catch (err: any) {
      throw new Error('An unknown error occurred while trying to update group managers')
    }
  }

  async addSubgroup (parentId: string, childId: string) {
    const group = await this.findById(parentId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayManageGroups(group))) throw new Error('Current user is not permitted add a subgroup to a group.')
    try {
      await addSubgroup(parentId, childId)
      await groupHierarchyCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while adding a subgroup to a group')
    }
  }

  async removeSubgroup (parentId: string, childId: string) {
    const group = await this.findById(parentId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayManageGroups(group))) throw new Error('Current user is not permitted remove a subgroup from a group.')
    try {
      const removed = await removeSubgroup(parentId, childId)
      if (removed) {
        await groupHierarchyCache.clear()
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage('cannot remove non-existent subgroup relationship')
        return response
      }
    } catch (err: any) {
      throw new Error('An unknown error occurred while removing a subgroup from a group')
    }
  }

  protected currentGroupsSet?: Set<string>
  async mayView (group: Group) {
    const user = await this.currentUser()
    if (!user) return false
    if (await this.haveGlobalPerm('manageUsers')) return true
    this.currentGroupsSet ??= new Set((await this.currentGroups()).map(g => g.id))
    if (this.currentGroupsSet.has(group.id)) return true
    const managerIds = await groupManagerCache.get(group.id)
    return managerIds.some(u => u.id === user.id)
  }

  async mayViewManagerUI () {
    return (await this.haveGlobalPerm('manageUsers')) || (this.login && await this.findByManagerId(this.login))
  }

  async mayCreate () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayUpdate (group: Group) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayDelete (group: Group) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayManageUsers (group: Group) {
    if (await this.haveGlobalPerm('manageUsers')) return true
    const user = await this.currentUser()
    if (!user) return false
    const managers = await this.getGroupManagers(group.id)
    return managers.some(m => m.id === user.id)
  }

  async mayManageGroups (group: Group) {
    return await this.mayManageUsers(group)
  }
}
