import db from 'mysql2-async/db'
import { AssetRule } from './assetrule.model'

export async function getAssetRules (roleIds: string[]) {
  const binds: string[] = []
  const rules = await db.getall(`SELECT * FROM assetrules
                                 WHERE roleId IN (${db.in(binds, roleIds)})`, binds)
  return rules.map(row => new AssetRule(row))
}
