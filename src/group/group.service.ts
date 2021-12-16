import { DosGatoService } from '../util/authservice'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Group, GroupFilter, GroupResponse } from './group.model'
import { getGroups, getGroupsWithUser, getGroupsWithRole, groupManagerCache, groupHierarchyCache, createGroup, updateGroup, deleteGroup, addUserToGroup, removeUserFromGroup, setGroupManager } from './group.database'
import { unique, filterConcurrent } from 'txstate-utils'
import { UserService } from '../user'
import { ValidatedResponse } from '@txstate-mws/graphql-server'

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

export class GroupService extends DosGatoService {
  async find () {
    return await getGroups()
  }

  async findByUserId (userId: string, direct?: boolean) {
    const directGroups = await this.loaders.get(groupsByUserIdLoader).load(userId)
    if (typeof direct !== 'undefined' && direct) {
      return directGroups
    } else {
      const directGroupIds = directGroups.map(d => d.id)
      const indirectGroups = await this.getAllSupers(directGroupIds)
      if (typeof direct === 'undefined') {
        return unique([...directGroups, ...indirectGroups], 'id')
      } else {
        return indirectGroups
      }
    }
  }

  async getSubgroups (groupId: string, recursive: boolean = true) {
    const groupMap = await groupHierarchyCache.get()
    const group = groupMap[groupId]
    if (!group) return []
    if (recursive) return Array.from(group.descendantIds()).map(id => groupMap[id])
    else return group.children as Group[]
  }

  async getAllSubs (groupIds: string[]) {
    return unique((await Promise.all(groupIds.map(async id => await this.getSubgroups(id)))).flat(), 'id')
  }

  async getSuperGroups (groupId: string, recursive = true) {
    const groupMap = await groupHierarchyCache.get()
    const group = groupMap[groupId]
    if (!group) return []
    if (recursive) return Array.from(group.ancestorIds()).map(id => groupMap[id])
    else return group.parents as Group[]
  }

  async getAllSupers (groupIds: string[]) {
    return unique((await Promise.all(groupIds.map(async id => await this.getSuperGroups(id)))).flat(), 'id')
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: GroupFilter) {
    if (direct) {
      return await this.loaders.get(groupsByRoleIdLoader, filter).load(roleId)
    } else {
      // need to get all of the groups and subgroups and THEN filter them
      const groups = await this.loaders.get(groupsByRoleIdLoader).load(roleId)
      const subgroups = await this.getAllSubs(groups.map(g => g.id))
      let ret = (typeof direct === 'undefined') ? unique([...groups, ...subgroups], 'id') : subgroups
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
      return ret
    }
  }

  async getGroupManagers (groupId: string) {
    const managerIds = await groupManagerCache.get(groupId)
    if (managerIds.length) return await this.svc(UserService).find({ internalIds: managerIds })
    else return []
  }

  async create (name: string) {
    if (!(await this.mayManage())) throw new Error('Current user is not permitted to create groups.')
    const response = new GroupResponse({})
    try {
      const groupId = await createGroup(name)
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
    if (!(await this.mayManage())) throw new Error('Current user is not permitted to update group names.')
    const response = new GroupResponse({})
    try {
      await updateGroup(id, name)
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
    if (!(await this.mayManage())) throw new Error('Current user is not permitted to delete groups.')
    try {
      await deleteGroup(id)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while deleting the group.')
    }
  }

  async addUserToGroup (groupId: string, userId: string) {
    if (!(await this.mayManage())) throw new Error('Current user is not permitted to add users to groups.')
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
    if (!(await this.mayManage())) throw new Error('Current user is not permitted to remove users from groups.')
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
    if (!(await this.mayManage())) throw new Error('Current user is not permitted add or remove group managers.')
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

  async mayView (): Promise<boolean> {
    return true
  }

  async mayManage () {
    return await this.haveGlobalPerm('manageUsers')
  }
}
