import db from 'mysql2-async/db'
import { Role, RoleFilter } from './role.model'

export async function getRoles (filter: RoleFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter.ids?.length) {
    where.push(`roles.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.users?.length) {
    where.push(`users.login IN (${db.in(binds, filter.users)})`)
  }
  if (!where.length) { throw new Error('Must include filters') }
  let query = 'SELECT roles.* from roles '
  if (filter.users?.length) {
    query += 'INNER JOIN users_roles ON users_roles.roleId = roles.id INNER JOIN users on users_roles.userId = users.id '
  }
  query += `WHERE (${where.join(') AND (')})`
  const roles = await db.getall(query, binds)
  return roles.map(r => new Role(r))
}

export async function getRolesWithGroup (groupIds: string[]) {
  const binds: string[] = []
  const where: string[] = []
  where.push(`groups.id IN (${db.in(binds, groupIds)})`)
  const roles = await db.getall(`SELECT roles.*, groups.id AS groupId
                                 FROM roles INNER JOIN groups_roles ON roles.id = groups_roles.roleId
                                 INNER JOIN groups ON groups_roles.groupId = groups.id
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
