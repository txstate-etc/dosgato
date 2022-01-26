import db from 'mysql2-async/db'
import { PageRule, PageRuleFilter, CreatePageRuleInput } from 'internal'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: PageRuleFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (filter.ids?.length) {
    where.push(`pagerules.id IN (${db.in(binds, filter.ids)})`)
  }
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

export async function createPageRule (args: CreatePageRuleInput) {
  const columns: string[] = ['roleId']
  const binds: string[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating a page rule')
  }
  binds.push(args.roleId)
  if (args.siteId) {
    columns.push('siteId')
    binds.push(args.siteId)
  }
  if (args.pagetreeId) {
    columns.push('pagetreeId')
    binds.push(args.pagetreeId)
  }
  if (args.path) {
    columns.push('path')
    binds.push(args.path)
  }
  if (args.mode) {
    columns.push('mode')
    binds.push(args.mode)
  }
  if (args.grants) {
    if (args.grants.create) {
      columns.push('create')
      binds.push(String(args.grants.create))
    }
    if (args.grants.delete) {
      columns.push('delete')
      binds.push(String(args.grants.delete))
    }
    if (args.grants.move) {
      columns.push('move')
      binds.push(String(args.grants.move))
    }
    if (args.grants.publish) {
      columns.push('publish')
      binds.push(String(args.grants.publish))
    }
    if (args.grants.undelete) {
      columns.push('undelete')
      binds.push(String(args.grants.undelete))
    }
    if (args.grants.unpublish) {
      columns.push('unpublish')
      binds.push(String(args.grants.unpublish))
    }
    if (args.grants.update) {
      columns.push('update')
      binds.push(String(args.grants.update))
    }
  }
  return await db.insert(`INSERT INTO pagerules (${columns.join(',')}) VALUES(${binds.join(',')})`, binds)
}
