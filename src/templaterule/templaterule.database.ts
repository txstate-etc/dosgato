import db from 'mysql2-async/db'
import { TemplateRule } from './templaterule.model'

export async function getTemplateRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM templaterules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new TemplateRule(row))
}
