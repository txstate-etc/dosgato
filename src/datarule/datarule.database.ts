import db from 'mysql2-async/db'
import { DataRule } from 'internal'

export async function getDataRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM datarules
                                 WHERE roleId IN (${db.in(binds, roleIds)})
                                 ORDER BY siteId, path`, binds)
  return rules.map(row => new DataRule(row))
}
