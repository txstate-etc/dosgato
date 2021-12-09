import db from 'mysql2-async/db'
import { Group, GroupFilter } from './group.model'
import { Cache } from 'txstate-utils'

export const parentGroupCache = new Cache(async () => {
  const rows = await getGroupRelationships()
  return rows.map(r => new GroupRelationship(r))
}, {
  freshseconds: 60 * 60,
  staleseconds: 24 * 60 * 60
})

export const groupManagerCache = new Cache(async (groupId: string) => {
  const managers = await db.getall('SELECT userId FROM users_groups WHERE groupId = ? AND manager IS TRUE', [groupId])
  return managers.map(m => m.userId)
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

export async function getGroupsWithUser (userIds: string[]) {
  const binds: string[] = []
  const where: string[] = []

  where.push(`users.login IN (${db.in(binds, userIds)})`)
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

export async function getGroupRelationships () {
  return await db.getall(`SELECT gg.*, g.name AS parentName, g2.name AS childName
                          FROM groups_groups gg
                          INNER JOIN groups g ON gg.parentId = g.id
                          INNER JOIN groups g2 ON gg.childId = g2.id`)
}

export async function createGroup (name: string) {
  const groupId = await db.insert('INSERT INTO groups (name) VALUES (?)', [name])
  return groupId
}

export class GroupRelationship {
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
