import db from 'mysql2-async/db'
import { SiteRule, SiteRuleFilter } from './siterule.model'

function processFilters (filter: SiteRuleFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter.roleIds?.length) {
    where.push(`roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter.siteIds?.length) {
    where.push(`siteId IN (${db.in(binds, filter.siteIds)})`)
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
