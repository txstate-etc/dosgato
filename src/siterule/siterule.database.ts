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
  if (filter.manageOwners) {
    where.push('manageOwners IS TRUE')
  }
  if (filter.managePagetrees) {
    where.push('managePagetrees IS TRUE')
  }
  if (filter.promotePagetree) {
    where.push('promotePagetree IS TRUE')
  }
  if (filter.delete) {
    where.push('`delete` IS TRUE')
  }
  if (filter.undelete) {
    where.push('undelete IS TRUE')
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
  const binds: (string|boolean)[] = []
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
    if (args.grants.managePagetrees) {
      columns.push('`managePagetrees`')
      binds.push(args.grants.managePagetrees)
    }
    if (args.grants.promotePagetree) {
      columns.push('`promotePagetree`')
      binds.push(args.grants.promotePagetree)
    }
    if (args.grants.manageOwners) {
      columns.push('`manageOwners`')
      binds.push(args.grants.manageOwners)
    }
    if (args.grants.delete) {
      columns.push('`delete`')
      binds.push(args.grants.delete)
    }
    if (args.grants.undelete) {
      columns.push('`undelete`')
      binds.push(args.grants.undelete)
    }
  }
  return await db.insert(`INSERT INTO siterules (${columns.join(',')}) VALUES(${columns.map((c) => '?').join(',')})`, binds)
}

export async function updateSiteRule (args: UpdateSiteRuleInput) {
  const updates: string[] = []
  const binds: (string|boolean)[] = []
  if (typeof args.siteId !== 'undefined') {
    updates.push('siteId = ?')
    binds.push(args.siteId)
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
    if (isNotNull(args.grants.managePagetrees)) {
      updates.push('`managePagetrees` = ?')
      binds.push(args.grants.managePagetrees)
    }
    if (isNotNull(args.grants.promotePagetree)) {
      updates.push('`promotePagetree` = ?')
      binds.push(args.grants.promotePagetree)
    }
    if (isNotNull(args.grants.manageOwners)) {
      updates.push('`manageOwners` = ?')
      binds.push(args.grants.manageOwners)
    }
    if (isNotNull(args.grants.delete)) {
      updates.push('`delete` = ?')
      binds.push(args.grants.delete)
    }
    if (isNotNull(args.grants.undelete)) {
      updates.push('`undelete` = ?')
      binds.push(args.grants.undelete)
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
