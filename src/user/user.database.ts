import db from 'mysql2-async/db'
import { User, UserFilter } from './user.model'
import { isNotNull } from 'txstate-utils'

export async function getUsers (filter: UserFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter.ids?.length) {
    where.push(`login IN (${db.in(binds, filter.ids)})`)
  }
  if (isNotNull(filter.enabled)) {
    if (filter.enabled) {
      where.push('disabledAt IS NULL')
    } else {
      where.push('disabledAt IS NOT NULL')
    }
  }
  if (isNotNull(filter.hideDisabledBefore)) {
    where.push('disabledAt > ?')
    binds.push(filter.hideDisabledBefore.toISO())
  }
  if (!where.length) { throw new Error('Must include filters') }
  const users = await db.getall(`SELECT * FROM users WHERE (${where.join(') AND (')})`, binds)
  return users.map(u => new User(u))
}
