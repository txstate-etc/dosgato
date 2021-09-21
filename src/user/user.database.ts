import db from 'mysql2-async/db'
import { User, UserFilter } from './user.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter?: UserFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (typeof filter !== 'undefined') {
    if (filter.ids?.length) {
      where.push(`users.login IN (${db.in(binds, filter.ids)})`)
    }
    if (isNotNull(filter.enabled)) {
      if (filter.enabled) {
        where.push('users.disabledAt IS NULL')
      } else {
        where.push('users.disabledAt IS NOT NULL')
      }
    }
    if (isNotNull(filter.hideDisabledBefore)) {
      where.push('users.disabledAt > ?')
      binds.push(filter.hideDisabledBefore.toISO())
    }
  }
  return { binds, where }
}

export async function getUsers (filter: UserFilter) {
  const { binds, where } = processFilters(filter)
  if (!where.length) { throw new Error('Must include filters') }
  const users = await db.getall(`SELECT * FROM users WHERE (${where.join(') AND (')})`, binds)
  return users.map(u => new User(u))
}

export async function getUsersByInternalId (ids: number[]) {
  const binds: string[] = []
  const where: string[] = []
  where.push(`users.id IN (${db.in(binds, ids)})`)
  const users = await db.getall(`SELECT users.* FROM users WHERE (${where.join(') AND (')})`, binds)
  return users.map(u => new User(u))
}

export async function getUsersInGroup (groupIds: string[], filter?: UserFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`groups.id IN (${db.in(binds, groupIds)})`)
  const users = await db.getall(`SELECT users.*, groups.id AS groupId FROM users
                                  INNER JOIN users_groups ON users.id = users_groups.userId
                                  INNER JOIN groups on users_groups.groupId = groups.id
                                  WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.groupId), value: new User(row) }))
}

export async function getUsersWithRole (roleIds: string[], filter?: UserFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`roles.id IN (${db.in(binds, roleIds)})`)
  const users = await db.getall(`SELECT users.*, roles.id as roleId
                                 FROM users INNER JOIN users_roles ON users.id = users_roles.userId
                                 INNER JOIN roles ON users_roles.roleId = roles.id
                                 WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.roleId), value: new User(row) }))
}

export async function getUsersBySite (siteIds: string[]) {
  const binds: string[] = []
  const where: string[] = []
  if (siteIds.length) {
    where.push(`sites.id IN (${db.in(binds, siteIds)})`)
  }
  const users = await db.getall(`SELECT users.*, sites.id AS siteId FROM users
                  INNER JOIN sites_managers ON users.id = sites_managers.userId
                  INNER JOIN sites ON sites_managers.siteId = sites.id
                  WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.siteId), value: new User(row) }))
}
