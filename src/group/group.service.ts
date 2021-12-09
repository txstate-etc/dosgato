import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Group, GroupFilter, GroupResponse } from './group.model'
import { getGroups, getGroupsWithUser, getGroupsWithRole, groupManagerCache, GroupRelationship, createGroup, parentGroupCache } from './group.database'
import { unique, filterConcurrent } from 'txstate-utils'
import { UserService } from '../user'

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

export class GroupService extends AuthorizedService<Group> {
  async find () {
    return await getGroups()
  }

  async findByUserId (userId: string, direct?: boolean) {
    const directGroups = await this.loaders.get(groupsByUserIdLoader).load(userId)
    if (typeof direct !== 'undefined' && direct) {
      return directGroups
    } else {
      const directGroupIds = directGroups.map(d => d.id)
      const indirectGroups = await getRelatives(directGroupIds, 'parents')
      if (typeof direct === 'undefined') {
        return unique([...directGroups, ...indirectGroups])
      } else {
        return indirectGroups
      }
    }
  }

  async getSubgroups (groupId: string, recursive: boolean = true) {
    if (recursive) return await getRelatives([groupId], 'children')
    else {
      const groupCache = await parentGroupCache.get()
      return groupCache.filter(relationship => relationship.parentId === groupId).map(g => new Group({ id: g.childId, name: g.childName }))
    }
  }

  async getSuperGroups (groupId: string) {
    return await getRelatives([groupId], 'parents')
  }

  async findByRoleId (roleId: string, direct?: boolean, filter?: GroupFilter) {
    if (direct) {
      return await this.loaders.get(groupsByRoleIdLoader, filter).load(roleId)
    } else {
      // need to get all of the groups and subgroups and THEN filter them
      const groups = await this.loaders.get(groupsByRoleIdLoader).load(roleId)
      const groupIds = groups.map(g => g.id)
      const subgroups = await getRelatives(groupIds, 'children')
      let ret = (typeof direct === 'undefined') ? unique([...groups, ...subgroups]) : subgroups
      if (filter?.ids?.length) {
        ret = ret.filter(sg => filter.ids?.includes(sg.id))
      }
      if (filter?.managerIds?.length) {
        ret = await filterConcurrent(ret, async (sg) => {
          const managers = await this.getGroupManagers(sg.id)
          return managers.some(manager => filter.managerIds?.includes(manager.id))
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
    // TODO: make sure the logged in user has permission to create a group
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

  async mayView (): Promise<boolean> {
    return true
  }
}

const getRelatives = async function (groupIds: string[], direction: 'parents'|'children') {
  const groupCache = await parentGroupCache.get()
  const visited = new Map<string, boolean>()
  for (const id of groupIds) {
    visit(id, visited, groupCache, true, direction)
  }
  const visitedGroupIds: string[] = Array.from(visited.keys())
  return visitedGroupIds.map(groupId => {
    if (direction === 'parents') {
      const found: GroupRelationship = groupCache.find(l => l.parentId === groupId)!
      return new Group({ id: found.parentId, name: found.parentName })
    } else {
      const found: GroupRelationship = groupCache.find(l => l.childId === groupId)!
      return new Group({ id: found.childId, name: found.childName })
    }
  })
}

const visit = function (groupId: string, visited: Map<string, boolean>, groupCache: GroupRelationship[], isDirectRelative: boolean, direction: 'parents'|'children') {
  if (visited.has(groupId)) return
  if (!isDirectRelative) visited.set(groupId, true)
  let related: string[]
  if (direction === 'parents') {
    related = groupCache.filter(r => r.childId === groupId).map(g => g.parentId)
  } else {
    related = groupCache.filter(r => r.parentId === groupId).map(g => g.childId)
  }
  for (const group of related) {
    visit(group, visited, groupCache, false, direction)
  }
}
