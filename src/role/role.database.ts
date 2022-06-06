import db from 'mysql2-async/db'
import { Role, RoleFilter } from '../internal.js'

export async function getRoles (filter?: RoleFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`roles.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.users?.length) {
    where.push(`users.login IN (${db.in(binds, filter.users)})`)
  }
  let query = 'SELECT roles.* from roles '
  if (filter?.users?.length) {
    query += 'INNER JOIN users_roles ON users_roles.roleId = roles.id INNER JOIN users on users_roles.userId = users.id '
  }
  if (where.length) {
    query += `WHERE (${where.join(') AND (')})`
  }
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

export async function createRole (name: string) {
  return await db.insert('INSERT INTO roles (name) VALUES (?)', [name])
}

export async function updateRole (id: string, name: string) {
  return await db.update('UPDATE roles SET name = ? WHERE id = ?', [name, id])
}

export async function deleteRole (id: string) {
  return await db.transaction(async db => {
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

export async function addRoleToUser (roleId: string, userId: number) {
  return await db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [userId, roleId])
}

export async function removeRoleFromUser (roleId: string, userId: number) {
  return await db.delete('DELETE FROM users_roles WHERE roleId = ? AND userId = ?', [roleId, userId])
}

export async function addRoleToGroup (groupId: string, roleId: string) {
  return await db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [groupId, roleId])
}

export async function removeRoleFromGroup (groupId: string, roleId: string) {
  return await db.delete('DELETE FROM groups_roles WHERE groupId = ? AND roleId = ?', [groupId, roleId])
}
