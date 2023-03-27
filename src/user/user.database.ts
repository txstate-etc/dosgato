import db from 'mysql2-async/db'
import { isNotNull, unique } from 'txstate-utils'
import { User, type UserFilter } from '../internal.js'

function processFilters (filter?: UserFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (typeof filter !== 'undefined') {
    if (filter.internalIds?.length) {
      where.push(`users.id IN (${db.in(binds, filter.internalIds)})`)
    }
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
    if (isNotNull(filter.trained)) {
      if (filter.trained) {
        where.push('users.trained IS TRUE')
      } else {
        where.push('users.trained IS FALSE')
      }
    }
    if (isNotNull(filter.system)) {
      if (filter.system) {
        where.push('users.system IS TRUE')
      } else {
        where.push('users.system IS FALSE')
      }
    }
  }
  return { binds, where }
}

export async function getUsers (filter: UserFilter) {
  const { binds, where } = processFilters(filter)
  const users = where.length
    ? await db.getall(`SELECT * FROM users WHERE (${where.join(') AND (')}) ORDER BY login`, binds)
    : await db.getall('SELECT * FROM users ORDER BY login')
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
  where.push(`users_groups.groupId IN (${db.in(binds, groupIds)})`)
  const users = await db.getall(`SELECT users.*, users_groups.groupId AS groupId FROM users
                                 INNER JOIN users_groups ON users.id = users_groups.userId
                                 WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.groupId), value: new User(row) }))
}

export async function getUsersWithRole (roleIds: string[], filter?: UserFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`users_roles.roleId IN (${db.in(binds, roleIds)})`)
  const users = await db.getall(`SELECT users.*, users_roles.roleId AS roleId
                                 FROM users INNER JOIN users_roles ON users.id = users_roles.userId
                                 WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.roleId), value: new User(row) }))
}

export async function getUsersBySite (siteIds: string[]) {
  const binds: string[] = []
  const where: string[] = []
  if (siteIds.length) {
    where.push(`sites_managers.siteId IN (${db.in(binds, siteIds)})`)
  }
  const users = await db.getall(`SELECT users.*, sites_managers.siteId AS siteId
                                 FROM users INNER JOIN sites_managers ON users.id = sites_managers.userId
                                 WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.siteId), value: new User(row) }))
}

export async function getUsersManagingGroups (groupIds: string[], direct?: boolean) {
  if (!groupIds.length) return []
  const [directManagers, siteManagers] = await Promise.all([
    db.getall(`SELECT u.*, g.id AS groupId
               FROM groups g
               INNER JOIN groups_managers gm ON gm.groupId=g.id
               INNER JOIN users u ON u.id=gm.userId
               WHERE g.id IN (${db.in([], groupIds)})`, groupIds),
    db.getall(`SELECT u.*, g.id AS groupId
               FROM groups g
               INNER JOIN groups_sites gs ON gs.groupId=g.id
               INNER JOIN sites_managers sm ON sm.siteId=gs.siteId
               INNER JOIN users u ON u.id=sm.userId
               WHERE g.id IN (${db.in([], groupIds)})`, groupIds)
  ])
  const all = !direct ? siteManagers : []
  if (direct !== false) all.push(...directManagers)
  return unique(all, row => [row.id, row.groupId])
    .map(row => ({ key: String(row.groupId), value: new User(row) }))
}

export async function createUser (id: string, firstname: string, lastname: string, email: string, trained: boolean, system: boolean) {
  return await db.insert('INSERT INTO users (login, firstname, lastname, email, trained, system) VALUES (?, ?, ?, ?, ?, ?)', [id, firstname, lastname, email, trained, system])
}

export async function updateUser (id: string, firstname: string | undefined, lastname: string | undefined, email: string | undefined, trained: boolean | undefined) {
  const updates: string[] = []
  const binds: (string | boolean)[] = []
  if (firstname) {
    updates.push('firstname = ?')
    binds.push(firstname)
  }
  if (lastname) {
    updates.push('lastname = ?')
    binds.push(lastname)
  }
  if (email) {
    updates.push('email = ?')
    binds.push(email)
  }
  if (typeof trained !== 'undefined') {
    updates.push('trained = ?')
    binds.push(trained)
  }
  if (updates.length) {
    binds.push(id)
    await db.update(`UPDATE users SET ${updates.join(',')} WHERE login = ?`, binds)
  }
}

export async function disableUsers (users: User[]) {
  const binds: number[] = []
  if (!users.length) return 0
  return await db.update(`UPDATE users SET disabledAt = NOW() WHERE disabledAt IS NULL AND id IN (${db.in(binds, users.map(u => u.internalId))})`, binds)
}

export async function enableUsers (users: User[]) {
  const binds: number[] = []
  if (!users.length) return 0
  return await db.update(`UPDATE users SET disabledAt = NULL WHERE disabledAt IS NOT NULL AND id IN (${db.in(binds, users.map(u => u.internalId))})`, binds)
}
