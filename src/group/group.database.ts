import db from 'mysql2-async/db'
import { Group, GroupFilter } from './group.model'

function processFilters (filter?: GroupFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (typeof filter !== 'undefined') {
    if (filter.ids?.length) {
      where.push(`groups.id IN (${db.in(binds, filter.ids)})`)
    }
    // TODO: Handle managerIds filter
    // if (filter.managerIds?.length) {}
  }
  return { binds, where }
}

export async function getGroups () {
  const groups = await db.getall('SELECT * FROM groups')
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

export async function getGroupRelationships () {
  return await db.getall(`SELECT gg.*, g.name AS parentName, g2.name AS childName
                          FROM groups_groups gg
                          INNER JOIN groups g ON gg.parentId = g.id
                          INNER JOIN groups g2 ON gg.childId = g2.id`)
}

export async function getGroupsWithRole (roleIds: string[], filter?: GroupFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`roles.id IN (${db.in(binds, roleIds)})`)
  const groups = await db.getall(`SELECT groups.*, roles.id as roleId
                                  FROM groups INNER JOIN groups_roles ON groups.id = groups_roles.groupId
                                  INNER JOIN roles ON groups_roles.roleId = roles.id
                                  WHERE (${where.join(') AND (')})`, binds)

  return groups.map(row => ({ key: String(row.roleId), value: new Group(row) }))
}
