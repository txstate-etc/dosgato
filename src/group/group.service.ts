import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { Group } from './group.model'
import { getGroups, getGroupsWithUser, getGroupRelationships } from './group.database'
import { Cache, unique } from 'txstate-utils'

const parentGroupCache = new Cache(async () => {
  const rows = await getGroupRelationships()
  return rows.map(r => new GroupRelationship(r))
}, {
  freshseconds: 60 * 60,
  staleseconds: 24 * 60 * 60
})

const groupsByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[]) => {
    return await getGroupsWithUser(userIds)
  }
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

class GroupRelationship {
  parentId: string
  parentName: string
  childId: string
  childName: string

  constructor (row: any) {
    this.parentId = String(row.parentId)
    this.parentName = row.parentName
    this.childId = String(row.childId)
    this.childName = row.childName
  }
}
