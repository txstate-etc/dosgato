import db from 'mysql2-async/db'
import { DateTime } from 'luxon'

export async function updateLastLogin (userId: string, tokenIssuedAt: number) {
  const lastLogin = DateTime.fromSeconds(tokenIssuedAt).toUTC().toFormat('y-LL-dd HH:mm:ss')
  await db.update('UPDATE users SET lastLogin = ? WHERE login = ?', [lastLogin, userId])
  return lastLogin
}
