import db from 'mysql2-async/db'
import { intersect, isNotNull, rescue, unique } from 'txstate-utils'
import { Training, User, templateRegistry, type UserFilter } from '../internal.js'

async function processFilters (filter?: UserFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (typeof filter !== 'undefined') {
    let trainingAllPromise: Promise<number[]> | undefined
    let trainingAnyPromise: Promise<number[]> | undefined
    let trainingNonePromise: Promise<number[]> | undefined
    if (filter.trainingAll?.length) {
      const tbinds: any[] = []
      trainingAllPromise = db.getvals(`SELECT userId FROM users_trainings WHERE trainingId IN (${db.in(tbinds, filter.trainingAll)}) GROUP BY userId HAVING COUNT(*) = ?`, [...tbinds, filter.trainingAll.length])
    }
    if (filter.trainingAny?.length) {
      const tbinds: any[] = []
      trainingAnyPromise = db.getvals(`SELECT userId FROM users_trainings WHERE trainingId IN (${db.in(tbinds, filter.trainingAny)})`, tbinds)
    }
    if (filter.trainingNone?.length) {
      const tbinds: any[] = []
      trainingNonePromise = db.getvals(`SELECT u.id FROM users u LEFT JOIN users_trainings ut ON u.id=ut.userId AND ut.trainingId IN (${db.in(tbinds, filter.trainingNone)}) WHERE ut.userId IS NULL`, tbinds)
    }
    if (trainingAllPromise) {
      const ids = await trainingAllPromise
      if (!ids.length) filter.noresults = true
      filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, ids)
    }
    if (trainingAnyPromise) {
      const ids = await trainingAnyPromise
      if (!ids.length) filter.noresults = true
      filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, ids)
    }
    if (trainingNonePromise) {
      const ids = await trainingNonePromise
      if (!ids.length) filter.noresults = true
      filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, ids)
    }
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
      binds.push(filter.hideDisabledBefore.toISO()!)
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
  const { binds, where } = await processFilters(filter)
  if (filter.noresults) return []
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
  const { binds, where } = await processFilters(filter)
  where.push(`users_groups.groupId IN (${db.in(binds, groupIds)})`)
  const users = await db.getall(`SELECT users.*, users_groups.groupId AS groupId FROM users
                                 INNER JOIN users_groups ON users.id = users_groups.userId
                                 WHERE (${where.join(') AND (')})`, binds)
  return users.map(row => ({ key: String(row.groupId), value: new User(row) }))
}

export async function getUsersWithRole (roleIds: string[], filter?: UserFilter) {
  const { binds, where } = await processFilters(filter)
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

export async function getTrainingsForUsers (userInternalIds: number[]) {
  const rows = await db.getall(`SELECT ut.userId, t.id, t.name FROM users_trainings ut INNER JOIN trainings t ON ut.trainingId=t.id WHERE ut.userId IN (${db.in([], userInternalIds)})`, userInternalIds)
  return rows.map(r => ({ key: r.userId, value: new Training(r) }))
}

export async function getAllTrainings () {
  return (await db.getall('SELECT * FROM trainings')).map(r => new Training(r))
}

async function syncTrainings (userInternalId: number, trainings: string[] | undefined) {
  if (trainings == null) return
  const binds: any[] = [userInternalId]
  if (trainings.length) {
    await db.delete(`DELETE FROM users_trainings WHERE userId = ? AND trainingId NOT IN (${db.in(binds, trainings)})`, binds)
    const ibinds: any[] = []
    await db.insert(`INSERT INTO users_trainings (userId, trainingId) VALUES ${db.in(ibinds, trainings.map(t => [userInternalId, t]))} ON DUPLICATE KEY UPDATE userId=userId`, ibinds)
  } else {
    await db.delete('DELETE FROM users_trainings WHERE userId = ?', binds)
  }
}

export async function addTrainings (trainingId: string, userIds: string[]) {
  if (!userIds.length) return
  const binds: any[] = [trainingId]
  await db.insert(`
    INSERT INTO users_trainings (userId, trainingId)
    SELECT id, ? FROM users WHERE login IN (${db.in(binds, userIds)})
    ON DUPLICATE KEY UPDATE userId=userId
  `, binds)
}

export async function createUser (id: string, firstname: string, lastname: string, email: string, trainings: string[] | undefined, system: boolean) {
  const userInternalId = await db.insert('INSERT INTO users (login, firstname, lastname, email, system) VALUES (?, ?, ?, ?, ?)', [id, firstname, lastname, email, system])
  await syncTrainings(userInternalId, trainings)
  return userInternalId
}

export async function updateUser (id: string, firstname: string | undefined, lastname: string | undefined, email: string | undefined, trainings: string[] | undefined) {
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
  if (updates.length) {
    binds.push(id)
    await db.update(`UPDATE users SET ${updates.join(',')} WHERE login = ?`, binds)
  }
  if (trainings != null) {
    const userInternalId = await db.getval<number>('SELECT id FROM users WHERE login=?', [id])
    if (userInternalId) await syncTrainings(userInternalId, trainings)
  }
}

export async function disableUsers (users: { internalId: number }[], automated = false) {
  const binds: number[] = [automated ? 1 : 0]
  if (!users.length) return 0
  return await db.update(`UPDATE users SET disabledAt = NOW(), disabledByAutomation=? WHERE disabledAt IS NULL AND id IN (${db.in(binds, users.map(u => u.internalId))})`, binds)
}

export async function enableUsers (users: { internalId: number }[]) {
  const binds: number[] = []
  if (!users.length) return 0
  return await db.update(`UPDATE users SET disabledAt = NULL, disabledByAutomation=0 WHERE disabledAt IS NOT NULL AND id IN (${db.in(binds, users.map(u => u.internalId))})`, binds)
}

const twoWeeks = 1000 * 60 * 60 * 24 * 14
export async function syncUsers () {
  const userLookup = templateRegistry.serverConfig.userLookup
  if (userLookup) {
    const users = await db.getall<{ id: number, login: string, firstname: string, lastname: string, email: string, disabledAt: Date, disabledByAutomation: 0 | 1 }>('SELECT id, login, firstname, lastname, email, disabledAt, disabledByAutomation FROM users WHERE system=0 AND (disabledAt IS NULL OR (disabledAt > NOW() - INTERVAL 2 WEEKS AND disabledByAutomation=1))')
    const externalUsersByLogin = await userLookup(users.map(u => u.login))
    const usersToDisable: number[] = []
    const usersToEnable: number[] = []
    const now = new Date().getTime()
    for (const u of users) {
      const exUser = externalUsersByLogin[u.login]
      if (exUser && (u.firstname !== exUser.firstname || u.lastname !== exUser.firstname || u.email !== exUser.email || (u.disabledAt == null) !== !!exUser.enabled)) {
        await rescue(updateUser(u.login, u.firstname, u.lastname, u.email, []))
        if (u.disabledAt == null && !exUser.enabled) usersToDisable.push(u.id)
        if (u.disabledAt != null && (now - u.disabledAt.getTime() < twoWeeks) && u.disabledByAutomation && !!exUser.enabled) usersToEnable.push(u.id)
      }
    }
    if (usersToDisable.length) await disableUsers(usersToDisable.map(internalId => ({ internalId })), true)
    if (usersToEnable.length) await enableUsers(usersToEnable.map(internalId => ({ internalId })))
  }
}
