import db from 'mysql2-async/db'
import { PageRule, PageRuleFilter } from 'internal'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: PageRuleFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (filter.roleIds?.length) {
    where.push(`pagerules.roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter.siteIds?.length) {
    const ors = []
    if (filter.siteIds.some(id => !id)) ors.push('pagerules.siteId IS NULL')
    const siteIds = filter.siteIds.filter(isNotNull)
    if (siteIds.length) ors.push(`pagerules.siteId IN (${db.in(binds, siteIds)})`)
    where.push(ors.join(' OR '))
  }
  if (filter.pagetreeIds?.length) {
    const ors = []
    if (filter.pagetreeIds.some(id => !id)) ors.push('pagerules.pagetreeId IS NULL')
    const pagetreeIds = filter.pagetreeIds.filter(isNotNull)
    if (pagetreeIds.length) ors.push(`pagerules.pagetreeId IN (${db.in(binds, pagetreeIds)})`)
    where.push(ors.join(' OR '))
  }
  if (filter.paths?.length) {
    where.push(`pagerules.path IN (${db.in(binds, filter.paths)})`)
  }
  if (isNotNull(filter.create)) {
    if (filter.create) {
      where.push('pagerules.create IS TRUE')
    } else {
      where.push('pagerules.create IS FALSE')
    }
  }
  if (isNotNull(filter?.update)) {
    if (filter.update) {
      where.push('pagerules.update IS TRUE')
    } else {
      where.push('pagerules.update IS FALSE')
    }
  }
  if (isNotNull(filter.move)) {
    if (filter.move) {
      where.push('pagerules.move IS TRUE')
    } else {
      where.push('pagerules.move IS FALSE')
    }
  }
  if (isNotNull(filter.publish)) {
    if (filter.publish) {
      where.push('pagerules.publish IS TRUE')
    } else {
      where.push('pagerules.publish IS FALSE')
    }
  }
  if (isNotNull(filter.unpublish)) {
    if (filter.unpublish) {
      where.push('pagerules.unpublish IS TRUE')
    } else {
      where.push('pagerules.unpubish IS FALSE')
    }
  }
  if (isNotNull(filter.delete)) {
    if (filter.delete) {
      where.push('pagerules.delete IS TRUE')
    } else {
      where.push('pagerules.delete IS FALSE')
    }
  }
  if (isNotNull(filter.undelete)) {
    if (filter.undelete) {
      where.push('pagerules.undelete IS TRUE')
    } else {
      where.push('pagerules.undelete IS FALSE')
    }
  }
  return { binds, where }
}

export async function getPageRules (filter: PageRuleFilter) {
  const { binds, where } = processFilters(filter)
  const rules = await db.getall(`SELECT * FROM pagerules
                                 WHERE (${where.join(') AND (')})
                                 ORDER BY siteId, pagetreeId, path`, binds)
  return rules.map(row => new PageRule(row))
}
