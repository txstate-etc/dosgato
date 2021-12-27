import db from 'mysql2-async/db'
import { GlobalRule } from 'internal'

export async function getGlobalRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM globalrules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new GlobalRule(row))
}
