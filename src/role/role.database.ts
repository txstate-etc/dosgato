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
