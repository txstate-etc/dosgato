import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { GlobalRule, GlobalRuleFilter, CreateGlobalRuleInput, UpdateGlobalRuleInput } from '../internal.js'

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
  const binds: (string | boolean)[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating a global rule')
  }
  binds.push(args.roleId)
  if (args.grants) {
    if (args.grants.manageAccess) {
      columns.push('manageAccess')
      binds.push(args.grants.manageAccess)
    }
    if (args.grants.manageParentRoles) {
      columns.push('manageParentRoles')
      binds.push(args.grants.manageParentRoles)
    }
    if (args.grants.createSites) {
      columns.push('createSites')
      binds.push(args.grants.createSites)
    }
    if (args.grants.manageGlobalData) {
      columns.push('manageGlobalData')
      binds.push(args.grants.manageGlobalData)
    }
    if (args.grants.manageTemplates) {
      columns.push('manageTemplates')
      binds.push(args.grants.manageTemplates)
    }
  }
  return await db.insert(`INSERT INTO globalrules (${columns.join(',')}) VALUES(${columns.map((c) => '?').join(',')})`, binds)
}

export async function updateGlobalRule (args: UpdateGlobalRuleInput) {
  const updates: string[] = []
  const binds: (string | boolean)[] = []
  if (args.grants) {
    if (isNotNull(args.grants.manageAccess)) {
      updates.push('`manageAccess` = ?')
      binds.push(args.grants.manageAccess)
    }
    if (isNotNull(args.grants.manageParentRoles)) {
      updates.push('`manageParentRoles` = ?')
      binds.push(args.grants.manageParentRoles)
    }
    if (isNotNull(args.grants.createSites)) {
      updates.push('`createSites` = ?')
      binds.push(args.grants.createSites)
    }
    if (isNotNull(args.grants.manageGlobalData)) {
      updates.push('`manageGlobalData` = ?')
      binds.push(args.grants.manageGlobalData)
    }
    if (isNotNull(args.grants.manageTemplates)) {
      updates.push('`manageTemplates` = ?')
      binds.push(args.grants.manageTemplates)
    }
  }
  binds.push(String(args.ruleId))
  return await db.update(`UPDATE globalrules
                          SET ${updates.join(', ')}
                          WHERE id = ?`, binds)
}

export async function deleteGlobalRule (ruleId: string) {
  return await db.delete('DELETE FROM globalrules WHERE id = ?', [ruleId])
}
