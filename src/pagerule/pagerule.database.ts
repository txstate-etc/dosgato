import db from 'mysql2-async/db'
import { PageRule } from './pagerule.model'

export async function getPageRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM pagerules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new PageRule(row))
}
