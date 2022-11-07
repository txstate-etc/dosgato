import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { SiteRule, SiteRuleFilter, CreateSiteRuleInput, UpdateSiteRuleInput } from '../internal.js'

function processFilters (filter: SiteRuleFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter.ids?.length) {
    where.push(`id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.roleIds?.length) {
    where.push(`roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter.siteIds?.length) {
    const ors = []
    if (filter.siteIds.some(id => !id)) ors.push('siterules.siteId IS NULL')
    const siteIds = filter.siteIds.filter(isNotNull)
    if (siteIds.length) ors.push(`siterules.siteId IN (${db.in(binds, siteIds)})`)
    where.push(ors.join('OR'))
  }
  if (filter.launch) {
    where.push('launch IS TRUE')
  }
  if (filter.rename) {
    where.push('`rename` IS TRUE')
  }
  if (filter.governance) {
    where.push('governance IS TRUE')
  }
  if (filter.manageState) {
    where.push('manageState IS TRUE')
  }
  if (filter.delete) {
    where.push('`delete` IS TRUE')
  }
  return { binds, where }
}

export async function getSiteRules (filter: SiteRuleFilter) {
  const { binds, where } = processFilters(filter)
  const rules = await db.getall(`SELECT * FROM siterules
                                 WHERE (${where.join(') AND (')})`, binds)
  return rules.map(row => new SiteRule(row))
}

export async function createSiteRule (args: CreateSiteRuleInput) {
  const columns: string[] = ['roleId']
  const binds: (string | boolean)[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating a site rule')
  }
  binds.push(args.roleId)
  if (args.siteId) {
    columns.push('siteId')
    binds.push(args.siteId)
  }
  if (args.grants) {
    if (args.grants.launch) {
      columns.push('`launch`')
      binds.push(args.grants.launch)
    }
    if (args.grants.rename) {
      columns.push('`rename`')
      binds.push(args.grants.rename)
    }
    if (args.grants.governance) {
      columns.push('`governance`')
      binds.push(args.grants.governance)
    }
    if (args.grants.manageState) {
      columns.push('`manageState`')
      binds.push(args.grants.manageState)
    }
    if (args.grants.delete) {
      columns.push('`delete`')
      binds.push(args.grants.delete)
    }
  }
  return await db.insert(`INSERT INTO siterules (${columns.join(',')}) VALUES(${columns.map((c) => '?').join(',')})`, binds)
}

export async function updateSiteRule (args: UpdateSiteRuleInput) {
  const updates: string[] = []
  const binds: (string | boolean | null)[] = []
  updates.push('siteId = ?')
  if (typeof args.siteId !== 'undefined') {
    binds.push(args.siteId)
  } else {
    binds.push(null)
  }
  if (args.grants) {
    if (isNotNull(args.grants.launch)) {
      updates.push('`launch` = ?')
      binds.push(args.grants.launch)
    }
    if (isNotNull(args.grants.rename)) {
      updates.push('`rename` = ?')
      binds.push(args.grants.rename)
    }
    if (isNotNull(args.grants.governance)) {
      updates.push('`governance` = ?')
      binds.push(args.grants.governance)
    }
    if (isNotNull(args.grants.manageState)) {
      updates.push('`manageState` = ?')
      binds.push(args.grants.manageState)
    }
    if (isNotNull(args.grants.delete)) {
      updates.push('`delete` = ?')
      binds.push(args.grants.delete)
    }
  }
  binds.push(String(args.ruleId))
  return await db.update(`UPDATE siterules
                          SET ${updates.join(', ')}
                          WHERE id = ?`, binds)
}

export async function deleteSiteRule (ruleId: string) {
  return await db.delete('DELETE FROM siterules WHERE id = ?', [ruleId])
}
