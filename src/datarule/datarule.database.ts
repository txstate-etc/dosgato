import db from 'mysql2-async/db'
import { DataRule, DataRuleFilter } from 'internal'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: DataRuleFilter) {
  const where: string[] = []
  const binds: string[] = []
  if (filter?.ids?.length) {
    where.push(`datarules.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.roleIds?.length) {
    where.push(`datarules.roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter?.siteIds?.length) {
    const ors = []
    if (filter.siteIds.some(id => !id)) ors.push('datarules.siteId IS NULL')
    const siteIds = filter.siteIds.filter(isNotNull)
    if (siteIds.length) ors.push(`datarules.siteId IN (${db.in(binds, siteIds)})`)
    where.push(ors.join('OR'))
  }
  return { binds, where }
}

export async function getDataRules (filter: DataRuleFilter) {
  const { binds, where } = processFilters(filter)
  const rules = await db.getall(`SELECT * FROM datarules
                                 WHERE (${where.join(') AND (')})
                                 ORDER BY siteId, path`, binds)
  return rules.map(row => new DataRule(row))
}
