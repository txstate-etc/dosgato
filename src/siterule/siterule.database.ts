import db from 'mysql2-async/db'
import { SiteRule } from './siterule.model'

export async function getSiteRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM siterules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new SiteRule(row))
}
