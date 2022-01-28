import db from 'mysql2-async/db'
import { GlobalRule, GlobalRuleFilter, CreateGlobalRuleInput } from 'internal'

export async function getGlobalRules (filter: GlobalRuleFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (filter.ids?.length) {
    where.push(`id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.roleIds?.length) {
    where.push(`roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  const rules = await db.getall(`SELECT * FROM globalrules
                                 WHERE (${where.join(') AND (')})`, binds)
  return rules.map(row => new GlobalRule(row))
}

export async function createGlobalRule (args: CreateGlobalRuleInput) {
  const columns: string[] = ['roleId']
  const binds: string[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating a global rule')
  }
  binds.push(args.roleId)
  if (args.grants) {
    if (args.grants.manageUsers) {
      columns.push('manageUsers')
      binds.push(String(args.grants.manageUsers))
    }
    if (args.grants.createSites) {
      columns.push('createSites')
      binds.push(String(args.grants.createSites))
    }
    if (args.grants.manageGlobalData) {
      columns.push('manageGlobalData')
      binds.push(String(args.grants.manageGlobalData))
    }
  }
  return await db.insert(`INSERT INTO globalrules (${columns.join(',')}) VALUES(${binds.join(',')})`, binds)
}
