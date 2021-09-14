import db from 'mysql2-async/db'
import { Group } from './group.model'

export async function getGroups () {
  const groups = await db.getall('SELECT * FROM groups')
  return groups.map(g => new Group(g))
}

export async function getGroupsWithUser (userIds: string[], filter?: { direct: boolean }) {
  // ignoring the filter for now...
  const binds: string[] = []
  const where: string[] = []
  where.push(`users.login IN (${db.in(binds, userIds)})`)
  const groups = await db.getall(`SELECT users.*, groups.*, users_groups.* from groups
                                  INNER JOIN users_groups ON groups.id = users_groups.groupId
                                  INNER JOIN users ON users.id = users_groups.userId
                                  WHERE (${where.join(') AND (')})`, binds)
  return groups.map(row => ({ key: row.login, value: new Group(row) }))
}
