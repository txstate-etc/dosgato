import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique, filterConcurrent, isNotNull, someAsync } from 'txstate-utils'
import {
  Group, GroupFilter, GroupResponse, getGroups, getGroupsWithUser, getGroupsWithRole,
  groupHierarchyCache, createGroup, updateGroup, deleteGroup, addGroupSite, removeGroupSite,
  addUserToGroups, removeUserFromGroups, setGroupManager, removeSubgroup, addSubgroup,
  UserService, DosGatoService, UserServiceInternal, setUserGroups, getGroupsWithManager, User, Site, getGroupsWithSite
} from 'internal'

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

const groupsByManagerIdLoader = new ManyJoinedLoader({
  fetch: async (managerIds: string[], direct?: boolean) => {
    return await getGroupsWithManager(managerIds, direct)
  },
  idLoader: groupsByIdLoader
})

const groupsBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[]) => {
    return await getGroupsWithSite(siteIds)
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

  async findByManager (manager: User, direct?: boolean) {
    return await this.loaders.get(groupsByManagerIdLoader, direct).load(manager.id)
  }

  async findBySite (site: Site) {
    return await this.loaders.get(groupsBySiteIdLoader).load(site.id)
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
          const managers = await this.svc(UserService).findGroupManagers(sg.id)
          return managers.some(manager => lookingFor.has(manager.id))
        })
      }
    }
    return ret
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

  async findByManager (manager: User, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByManager(manager, direct))
  }

  async findBySite (site: Site) {
    return await this.removeUnauthorized(await this.raw.findBySite(site))
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
      console.error(err)
      throw new Error(`An unknown error occurred while attempting to create group ${name}.`)
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
      console.error(err)
      throw new Error(`An unknown error occurred while updating the name for group ${group.name}.`)
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
      console.error(err)
      throw new Error(`An unknown error occurred while attempting to delete group ${group.name}.`)
    }
  }

  async addUserToGroups (groupIds: string[], userId: string) {
    const groups = (await (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull))
    if (await someAsync(groups, async (g: Group) => !(await this.mayManageUsers(g)))) {
      throw new Error('Current user is not permitted to add user to one or more groups.')
    }
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot add user who does not exist')
    try {
      await addUserToGroups(groups.map(g => g.id), user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to add user to one or more groups')
    }
  }

  async removeUserFromGroup (groupIds: string[], userId: string) {
    const groups = (await (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull))
    if (await someAsync(groups, async (g: Group) => !(await this.mayManageUsers(g)))) {
      throw new Error('Current user is not permitted to remove user from one or more groups.')
    }
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot add user who does not exist')
    try {
      const removed = await removeUserFromGroups(groupIds, user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.log(err)
      throw new Error('Unable to remove user from one or more groups')
    }
  }

  async setUserGroups (userId: string, groupIds: string[]) {
    const groups = (await (await Promise.all(groupIds.map(async id => await this.raw.findById(id)))).filter(isNotNull))
    if (await someAsync(groups, async (g: Group) => !(await this.mayManageUsers(g)))) {
      throw new Error('Current user is not permitted to manage users for one or more groups.')
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

  async setGroupManager (groupId: string, userId: string, manager: boolean) {
    const group = await this.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!(await this.mayUpdate(group))) throw new Error('Current user is not permitted to add or remove group managers.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('User does not exist')
    await setGroupManager(groupId, user.internalId, manager)
    this.loaders.clear()
    const updatedGroup = await this.findById(groupId)
    return new GroupResponse({ success: true, group: updatedGroup })
  }

  async addGroupSite (groupId: string, siteId: string) {
    const group = await this.raw.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!await this.mayUpdate(group)) throw new Error('Current user is not permitted to add or remove sites from this group.')
    await addGroupSite(groupId, siteId)
    this.loaders.clear()
    const updatedGroup = await this.findById(groupId)
    return new GroupResponse({ success: true, group: updatedGroup })
  }

  async removeGroupSite (groupId: string, siteId: string) {
    const group = await this.raw.findById(groupId)
    if (!group) throw new Error('Group to be updated does not exist.')
    if (!await this.mayUpdate(group)) throw new Error('Current user is not permitted to add or remove sites from this group.')
    await removeGroupSite(groupId, siteId)
    this.loaders.clear()
    const updatedGroup = await this.findById(groupId)
    return new GroupResponse({ success: true, group: updatedGroup })
  }

  async addSubgroup (parentId: string, childId: string) {
    const [parentGroup, childGroup] = await Promise.all([
      this.findById(parentId),
      this.findById(childId)
    ])
    if (!parentGroup) throw new Error('Group to be updated does not exist.')
    if (!childGroup) throw new Error('Group to be added as a subgroup does not exist.')
    if (!(await this.mayManageGroups(parentGroup))) throw new Error(`Current user is not permitted add a subgroup to group ${parentGroup.name}.`)
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
    if (!(await this.mayManageGroups(parentGroup))) throw new Error(`Current user is not permitted remove subgroups from group ${parentGroup.name}.`)
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

  async isManager (group: Group) {
    const managers = await this.svc(UserServiceInternal).findGroupManagers(group.id)
    return managers.some(m => m.id === this.login)
  }

  async mayView (group: Group) {
    if (await this.haveGlobalPerm('manageUsers')) return true
    if (await this.currentGroupsById(group.id)) return true
    return await this.isManager(group)
  }

  async mayViewManagerUI () {
    const user = await this.currentUser()
    if (!user) return false
    return (await this.haveGlobalPerm('manageUsers')) || (await this.findByManager(user)).length > 0
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
    return await this.isManager(group)
  }

  async mayManageGroups (group: Group) {
    return await this.mayManageUsers(group)
  }
}
