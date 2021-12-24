import db from 'mysql2-async/db'
import { Group, GroupFilter } from './group.model'
import { Cache, hashify } from 'txstate-utils'

export const groupManagerCache = new Cache(async (groupId: string) => {
  const managers = await db.getall('SELECT userId FROM users_groups WHERE groupId = ? AND manager IS TRUE', [groupId])
  return managers.map(m => m.userId)
})

class HierarchyGroup extends Group {
  children: HierarchyGroup[]
  parents: HierarchyGroup[]

  ancestorIds (seen = new Set<string>()) {
    for (const p of this.parents) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        p.ancestorIds(seen)
      }
    }
    return seen
  }

  descendantIds (seen = new Set<string>()) {
    for (const c of this.children) {
      if (!seen.has(c.id)) {
        seen.add(c.id)
        c.descendantIds(seen)
      }
    }
    return seen
  }

  constructor (row: any) {
    super(row)
    this.children = []
    this.parents = []
  }
}

export const groupHierarchyCache = new Cache(async () => {
  const [relationships, groups] = await Promise.all([
    db.getall<{ childId: number, parentId: number }>('SELECT * FROM groups_groups'),
    db.getall(`
      SELECT DISTINCT g.* FROM groups g
      INNER JOIN groups_groups gg ON g.id=gg.childId OR g.id=gg.parentId
    `)
  ])
  const groupNodes = groups.map(g => new HierarchyGroup(g))
  const groupMap = hashify(groupNodes, 'id')
  for (const r of relationships) {
    groupMap[r.childId].parents.push(groupMap[r.parentId])
    groupMap[r.parentId].children.push(groupMap[r.childId])
  }
  return groupMap
}, {
  freshseconds: 60,
  staleseconds: 600
})

function processFilters (filter?: GroupFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins = new Map<string, string>()

  if (filter?.ids?.length) {
    where.push(`groups.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.managerIds?.length) {
    if (!joins.has('users_groups')) {
      joins.set('users_groups', 'INNER JOIN users_groups ON groups.id = users_groups.groupId')
    }
    if (!joins.has('users')) {
      joins.set('users', 'INNER JOIN users on users_groups.userId = users.id')
    }
    where.push(`users.login IN (${db.in(binds, filter.managerIds)})`)
    where.push('users_groups.manager IS TRUE')
  }
  return { binds, where, joins }
}

export async function getGroups (filter?: GroupFilter) {
  const { binds, where, joins } = processFilters(filter)
  let query = 'SELECT * FROM groups'
  if (joins.size) {
    query += Array.from(joins.values()).join('\n')
  }
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  const groups = await db.getall(query, binds)
  return groups.map(g => new Group(g))
}

export async function getGroupsWithUser (userIds: string[], filters?: { manager: boolean }) {
  const binds: string[] = []
  const where: string[] = []

  where.push(`users.login IN (${db.in(binds, userIds)})`)
  if (filters?.manager) where.push('users_groups.manager=1')
  const directGroups = await db.getall(`SELECT users.*, groups.*, users_groups.* from groups
                                  INNER JOIN users_groups ON groups.id = users_groups.groupId
                                  INNER JOIN users ON users.id = users_groups.userId
                                  WHERE (${where.join(') AND (')})`, binds)
  return directGroups.map(row => ({ key: row.login, value: new Group(row) }))
}

export async function getGroupsWithRole (roleIds: string[], filter?: GroupFilter) {
  const { binds, where, joins } = processFilters(filter)
  if (!joins.has('groups_roles')) {
    joins.set('groups_roles', 'INNER JOIN groups_roles on groups.id = groups_roles.groupId')
  }
  where.push(`groups_roles.roleId IN (${db.in(binds, roleIds)})`)
  console.log(`SELECT groups.*, groups_roles.roleId as roleId
  FROM groups
  ${Array.from(joins.values()).join('\n')}
  WHERE (${where.join(') AND (')})`)
  const groups = await db.getall(`SELECT groups.*, groups_roles.roleId as roleId
                                  FROM groups
                                  ${Array.from(joins.values()).join('\n')}
                                  WHERE (${where.join(') AND (')})`, binds)
  return groups.map(row => ({ key: String(row.roleId), value: new Group(row) }))
}

export async function createGroup (name: string) {
  const groupId = await db.insert('INSERT INTO groups (name) VALUES (?)', [name])
  return groupId
}

export async function updateGroup (id: string, name: string) {
  return await db.update('UPDATE groups SET name = ? WHERE id = ?', [name, id])
}

export async function deleteGroup (id: string) {
  return await db.transaction(async db => {
    await Promise.all([
      db.delete('DELETE FROM groups_roles WHERE groupId = ?', [id]),
      db.delete('DELETE FROM groups_groups WHERE parentId = ? OR childId = ?', [id, id]),
      db.delete('DELETE FROM users_groups WHERE groupId = ?', [id])
    ])
    await db.delete('DELETE FROM groups where id = ?', [id])
  })
}

export async function addUserToGroup (groupId: string, userId: number) {
  return await db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [userId, groupId])
}

export async function removeUserFromGroup (groupId: string, userId: number) {
  return await db.delete('DELETE FROM users_groups WHERE userId = ? AND groupId = ?', [userId, groupId])
}

export async function setGroupManager (groupId: string, userId: number, manager: boolean) {
  return await db.update('UPDATE users_groups SET manager = ? WHERE userId = ? AND groupId = ?', [manager, userId, groupId])
}

export async function addRoleToGroup (groupId: string, roleId: string) {
  return await db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [groupId, roleId])
}

export async function removeRoleFromGroup (groupId: string, roleId: string) {
  return await db.delete('DELETE FROM groups_roles WHERE groupId = ? AND roleId = ?', [groupId, roleId])
}

export async function addSubgroup (parentId: string, childId: string) {
  return await db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [parentId, childId])
}

export async function removeSubgroup (parentId: string, childId: string) {
  return await db.delete('DELETE FROM groups_groups WHERE parentId = ? AND childId = ?', [parentId, childId])
}
