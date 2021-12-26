import db from 'mysql2-async/db'
import { AssetRule, AssetRuleFilter, CreateAssetRuleInput } from './assetrule.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: AssetRuleFilter) {
  const where: string[] = []
  const binds: string[] = []
  if (filter?.ids?.length) {
    where.push(`assetrules.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.roleIds?.length) {
    where.push(`assetrules.roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter?.siteIds?.length) {
    const ors = []
    if (filter.siteIds.some(id => !id)) ors.push('assetrules.siteId IS NULL')
    const siteIds = filter.siteIds.filter(isNotNull)
    if (siteIds.length) ors.push(`assetrules.siteId IN (${db.in(binds, siteIds)})`)
    where.push(ors.join('OR'))
  }
  if (filter?.paths?.length) {
    where.push(`assetrules.path IN (${db.in(binds, filter.paths)})`)
  }
  if (isNotNull(filter?.create)) {
    if (filter?.create) {
      where.push('assetrules.create IS TRUE')
    } else {
      where.push('assetrules.create IS FALSE')
    }
  }
  if (isNotNull(filter?.update)) {
    if (filter?.update) {
      where.push('assetrules.update IS TRUE')
    } else {
      where.push('assetrules.update IS FALSE')
    }
  }
  if (isNotNull(filter?.move)) {
    if (filter?.move) {
      where.push('assetrules.move IS TRUE')
    } else {
      where.push('assetrules.move IS FALSE')
    }
  }
  if (isNotNull(filter?.delete)) {
    if (filter?.delete) {
      where.push('assetrules.delete IS TRUE')
    } else {
      where.push('assetrules.delete IS FALSE')
    }
  }
  if (isNotNull(filter?.undelete)) {
    if (filter?.undelete) {
      where.push('assetrules.undelete IS TRUE')
    } else {
      where.push('assetrules.undelete IS FALSE')
    }
  }
  return { binds, where }
}

export async function getAssetRules (filter: AssetRuleFilter) {
  const { binds, where } = processFilters(filter)
  const rules = await db.getall(`SELECT * FROM assetrules
                                 WHERE (${where.join(') AND (')})`, binds)
  return rules.map(row => new AssetRule(row))
}

export async function createAssetRule (args: CreateAssetRuleInput) {
  const columns: string[] = ['roleId']
  const binds: string[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating an asset rule')
  }
  binds.push(args.roleId)
  if (args.mode) {
    columns.push('mode')
    binds.push(args.mode)
  }
  if (args.path) {
    columns.push('path')
    binds.push(args.path)
  }
  if (args.siteId) {
    columns.push('siteId')
    binds.push(args.siteId)
  }
  if (args.grants) {
    if (args.grants.create) {
      columns.push('create')
      binds.push(String(args.grants.create))
    }
    if (args.grants.update) {
      columns.push('update')
      binds.push(String(args.grants.update))
    }
    if (args.grants.move) {
      columns.push('move')
      binds.push(String(args.grants.move))
    }
    if (args.grants.delete) {
      columns.push('delete')
      binds.push(String(args.grants.delete))
    }
    if (args.grants.undelete) {
      columns.push('undelete')
      binds.push(String(args.grants.undelete))
    }
  }
  console.log(`INSERT INTO assetrules (${columns.join(',')}) VALUES(${binds.join(',')})`)
  return await db.insert(`INSERT INTO assetrules (${columns.join(',')}) VALUES(${binds.join(',')})`, binds)
}
