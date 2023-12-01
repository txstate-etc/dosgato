import db from 'mysql2-async/db'
import { Role, type RoleFilter } from '../internal.js'

export async function getRoles (filter?: RoleFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins = new Map<string, string>()
  if (filter?.ids?.length) {
    where.push(`roles.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.names?.length) {
    where.push(`roles.name IN (${db.in(binds, filter.names)})`)
  }
  if (filter?.notNames?.length) {
    where.push(`roles.name NOT IN (${db.in(binds, filter.notNames)})`)
  }
  if (filter?.users?.length) {
    where.push(`users.login IN (${db.in(binds, filter.users)})`)
  }
  if (filter?.siteIds?.length) {
    joins.set('site', 'LEFT JOIN sites ON sites.id = roles.siteId')
    where.push(`sites.id IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter?.managerIds?.length) {
    joins.set('managers', `
      INNER JOIN sites_managers sm ON sm.siteId=roles.siteId
      INNER JOIN users m ON m.id = sm.userId
    `)
    where.push(`m.login IN (${db.in(binds, filter.managerIds)})`)
  }
  if (filter?.users?.length) {
    joins.set('users_roles', `
      INNER JOIN users_roles ON users_roles.roleId = roles.id
      INNER JOIN users on users_roles.userId = users.id
    `)
  }
  let query = `SELECT DISTINCT roles.* FROM roles ${Array.from(joins.values()).join('\n')}`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  query += ' ORDER BY roles.name'
  const roles = await db.getall(query, binds)
  return roles.map(r => new Role(r))
}

export async function getRolesWithGroup (groupIds: string[]) {
  const binds: string[] = []
  const where: string[] = []
  where.push(`groups_roles.groupId IN (${db.in(binds, groupIds)})`)
  const roles = await db.getall(`SELECT roles.*, groups_roles.groupId as groupId
                                 FROM roles INNER JOIN groups_roles ON roles.id = groups_roles.roleId
                                 WHERE (${where.join(') AND (')})`, binds)
  return roles.map(row => ({ key: String(row.groupId), value: new Role(row) }))
}

export async function getRolesForUsers (userIds: string[]) {
  const binds: string[] = []
  const where: string[] = []

  where.push(`users.login IN (${db.in(binds, userIds)})`)
  const roles = await db.getall(`SELECT roles.*, users.login AS userId FROM roles
                                 INNER JOIN users_roles ON roles.id = users_roles.roleId
                                 INNER JOIN users ON users_roles.userId = users.id
                                 WHERE (${where.join(') AND (')})`, binds)
  return roles.map(row => ({ key: String(row.userId), value: new Role(row) }))
}

export async function getRolesWithManager (managerIds: string[]) {
  if (!managerIds.length) return []
  const siteGroups = await db.getall(`SELECT r.*, u.login
    FROM roles r
    INNER JOIN roles_sites rs ON rs.groupId=r.id
    INNER JOIN sites_managers sm ON sm.siteId=rs.siteId
    INNER JOIN users u ON u.id=sm.userId
    WHERE u.login IN (${db.in([], managerIds)})`, managerIds)
  return siteGroups.map(row => ({ key: row.login, value: new Role(row) }))
}

export async function roleNameIsUnique (name: string) {
  const count = await db.getval('SELECT COUNT(*) FROM roles WHERE name = ?', [name])
  return count === 0
}

export async function createRole (name: string) {
  return await db.insert('INSERT INTO roles (name) VALUES (?)', [name])
}

export async function updateRole (id: string, name: string) {
  return await db.update('UPDATE roles SET name = ? WHERE id = ?', [name, id])
}

export async function deleteRole (id: string) {
  await db.transaction(async db => {
    await Promise.all([
      db.delete('DELETE FROM groups_roles WHERE roleId = ?', [id]),
      db.delete('DELETE FROM users_roles WHERE roleId = ?', [id]),
      db.delete('DELETE FROM assetrules WHERE roleId = ?', [id]),
      db.delete('DELETE FROM datarules WHERE roleId = ?', [id]),
      db.delete('DELETE FROM globalrules WHERE roleId = ?', [id]),
      db.delete('DELETE FROM pagerules WHERE roleId = ?', [id]),
      db.delete('DELETE FROM siterules WHERE roleId = ?', [id]),
      db.delete('DELETE FROM assetrules WHERE roleId = ?', [id])
    ])
    await db.delete('DELETE FROM roles where id = ?', [id])
  })
}

export async function addRolesToUser (roleIds: string[], userId: number) {
  const binds: string[] = []
  if (roleIds.length) {
    return await db.insert(`INSERT INTO users_roles (userId, roleId) VALUES ${db.in(binds, roleIds.map(id => [userId, id]))} ON DUPLICATE KEY UPDATE userId=userId`, binds)
  }
}

export async function assignRoleToUsers (roleId: string, userIds: number[]) {
  const binds: (string | number)[] = []
  for (const id of userIds) {
    binds.push(roleId, id)
  }
  if (userIds.length) {
    return await db.insert(`INSERT INTO users_roles (roleId, userId) VALUES ${userIds.map(g => '(?,?)').join(',')} ON DUPLICATE KEY UPDATE userId=userId`, binds)
  }
}

export async function removeRoleFromUser (roleId: string, userId: number) {
  return await db.delete('DELETE FROM users_roles WHERE roleId = ? AND userId = ?', [roleId, userId])
}

export async function addRoleToGroups (groupIds: string[], roleId: string) {
  const binds: (string | number)[] = []
  for (const id of groupIds) {
    binds.push(roleId, id)
  }
  if (groupIds.length) {
    return await db.insert(`INSERT INTO groups_roles (roleId, groupId) VALUES ${groupIds.map(g => '(?,?)').join(',')} ON DUPLICATE KEY UPDATE groupId=groupId`, binds)
  }
}

export async function removeRoleFromGroup (groupId: string, roleId: string) {
  return await db.delete('DELETE FROM groups_roles WHERE groupId = ? AND roleId = ?', [groupId, roleId])
}

export async function addRoleSite (roleId: string, siteId: string) {
  return await db.update('INSERT IGNORE INTO roles_sites (roleId, siteId) VALUES (?, ?)', [roleId, siteId])
}

export async function removeRoleSite (roleId: string, siteId: string) {
  return await db.update('DELETE FROM roles_sites WHERE roleId=? AND siteId=?', [roleId, siteId])
}
