import db from 'mysql2-async/db'
import { DataRule } from './datarule.model'

export async function getDataRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM datarules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new DataRule(row))
}