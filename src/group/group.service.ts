import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { Group } from './group.model'
import { getGroups, getGroupsWithUser, getAllGroupsWithChildren } from './group.database'
import { Cache, unique } from 'txstate-utils'

const parentGroupCache = new Cache(async () => {
  const rows = await getAllGroupsWithChildren()
  return rows.map(r => new GroupWithChild(r))
}, {
  freshseconds: 60 * 60,
  staleseconds: 24 * 60 * 60
})

const groupsByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[], direct: boolean) => {
    return await getGroupsWithUser(userIds)
  }
})

export class GroupService extends AuthorizedService<Group> {
  async find () {
    return await getGroups()
  }

  async findByUserId (userId: string, direct: boolean) {
    const directGroups = await this.loaders.get(groupsByUserIdLoader).load(userId)
    if (typeof direct !== 'undefined' && direct) {
      return directGroups
    } else {
      const directGroupIds = directGroups.map(d => Number(d.id))
      const indirectGroups = await getAncestors(directGroupIds)
      if (typeof direct === 'undefined') {
        return unique([...directGroups, ...indirectGroups])
      } else {
        return indirectGroups
      }
    }
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
const getAncestors = async function (groupIds: number[]) {
  const groupCache = await parentGroupCache.get()
  const visited = new Map<Number, boolean>()
  for (const id of groupIds) {
    visit(id, visited, groupCache, true)
  }
  const visitedGroupIds: Number[] = Array.from(visited.keys())
  return visitedGroupIds.map(groupId => {
    const found: GroupWithChild = groupCache.find(l => l.parentId === groupId)!
    return new Group({ id: found.parentId, name: found.parentName })
  })
}

const visit = function (groupId: Number, visited: Map<Number, boolean>, groupCache: GroupWithChild[], isDirectParent: boolean) {
  if (visited.has(groupId)) return
  if (!isDirectParent) visited.set(groupId, true)
  const groupParents = groupCache.filter(r => r.childId === groupId).map(g => g.parentId)
  for (const group of groupParents) {
    visit(group, visited, groupCache, false)
  }
}

class GroupWithChild {
  parentId: number
  parentName: string
  childId: number

  constructor (row: any) {
    this.parentId = row.parentId
    this.parentName = row.parentName
    this.childId = row.childId
  }
}