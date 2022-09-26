import db from 'mysql2-async/db'
import { Cache, hashify, unique } from 'txstate-utils'
import { Group, GroupFilter, User } from '../internal.js'

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
  if (filter?.root) {
    where.push('groups.id NOT IN (SELECT childId FROM groups_groups)')
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

export async function getGroupsWithUser (userIds: string[]) {
  const binds: string[] = []
  const rows = await db.getall(`
    SELECT users.login, groups.* FROM groups
    INNER JOIN users_groups ON groups.id = users_groups.groupId
    INNER JOIN users ON users.id = users_groups.userId
    WHERE users.login IN (${db.in(binds, userIds)})`, binds)
  return rows.map(row => ({ key: row.login, value: new Group(row) }))
}

export async function getGroupsWithRole (roleIds: string[], filter?: GroupFilter) {
  const { binds, where, joins } = processFilters(filter)
  if (!joins.has('groups_roles')) {
    joins.set('groups_roles', 'INNER JOIN groups_roles on groups.id = groups_roles.groupId')
  }
  where.push(`groups_roles.roleId IN (${db.in(binds, roleIds)})`)
  const groups = await db.getall(`SELECT groups.*, groups_roles.roleId as roleId
                                  FROM groups
                                  ${Array.from(joins.values()).join('\n')}
                                  WHERE (${where.join(') AND (')})`, binds)
  return groups.map(row => ({ key: String(row.roleId), value: new Group(row) }))
}

export async function groupNameIsUnique (name: string) {
  const count = await db.getval('SELECT COUNT(*) FROM groups WHERE name = ?', [name])
  return count === 0
}

export async function createGroup (name: string, parent?: Group) {
  return await db.transaction(async db => {
    const groupId = await db.insert('INSERT INTO groups (name) VALUES (?)', [name])
    if (parent) {
      await db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [parent.id, groupId])
    }
    return groupId
  })
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

export async function addUserToGroups (groupIds: string[], userId: number) {
  const binds: (string | number)[] = []
  for (const id of groupIds) {
    binds.push(userId, id)
  }
  return await db.insert(`INSERT INTO users_groups (userId, groupId) VALUES ${groupIds.map(g => '(?,?)').join(',')}`, binds)
}

export async function removeUserFromGroups (groupIds: string[], userId: number) {
  const binds: (string | number)[] = [userId]
  return await db.delete(`DELETE FROM users_groups WHERE userId = ? AND groupId IN (${db.in(binds, groupIds)})`, binds)
}

export async function setUserGroups (userId: number, groupIds: string[]) {
  const binds: (string | number)[] = []
  for (const id of groupIds) {
    binds.push(userId, id)
  }
  return await db.transaction(async db => {
    await db.delete('DELETE FROM users_groups WHERE userId = ?', [userId])
    if (groupIds.length) {
      return await db.insert(`INSERT INTO users_groups (userId, groupId) VALUES ${groupIds.map(g => '(?,?)').join(',')}`, binds)
    }
  })
}

export async function setGroupUsers (groupId: string, userIds: number[]) {
  const binds: (string | number)[] = []
  for (const id of userIds) {
    binds.push(id, groupId)
  }
  return await db.transaction(async db => {
    await db.delete('DELETE FROM users_groups WHERE groupId = ?', [groupId])
    return await db.insert(`INSERT INTO users_groups (userId, groupId) VALUES ${userIds.map(u => '(?,?)').join(', ')}`, binds)
  })
}

export async function addSubgroup (parentId: string, childId: string) {
  return await db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [parentId, childId])
}

export async function removeSubgroup (parentId: string, childId: string) {
  return await db.delete('DELETE FROM groups_groups WHERE parentId = ? AND childId = ?', [parentId, childId])
}
