import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { DataRule, type DataRuleFilter, type CreateDataRuleInput, type UpdateDataRuleInput } from '../internal.js'

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
  if (filter?.templateIds?.length) {
    const ors = []
    if (filter.templateIds.some(id => !id)) ors.push('datarules.templateID IS NULL')
    const templateIds = filter.templateIds.filter(isNotNull)
    if (templateIds.length) ors.push(`datarules.templateId IN (${db.in(binds, templateIds)})`)
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

export async function createDataRule (args: CreateDataRuleInput) {
  const columns: string[] = ['roleId']
  const binds: (string | boolean | number)[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating an asset rule')
  }
  binds.push(args.roleId)
  if (args.siteId) {
    columns.push('siteId')
    binds.push(args.siteId)
  }
  if (args.templateId) {
    columns.push('templateId')
    const templateId = await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', [args.templateId])
    binds.push(templateId!)
  }
  if (args.path) {
    columns.push('path')
    binds.push(args.path)
  }
  if (args.grants) {
    if (args.grants.create) {
      columns.push('`create`')
      binds.push(args.grants.create)
    }
    if (args.grants.update) {
      columns.push('`update`')
      binds.push(args.grants.update)
    }
    if (args.grants.move) {
      columns.push('`move`')
      binds.push(args.grants.move)
    }
    if (args.grants.publish) {
      columns.push('`publish`')
      binds.push(args.grants.publish)
    }
    if (args.grants.unpublish) {
      columns.push('`unpublish`')
      binds.push(args.grants.unpublish)
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
  return await db.insert(`INSERT INTO datarules (${columns.join(',')}) VALUES(${columns.map((c) => '?').join(',')})`, binds)
}

export async function updateDataRule (args: UpdateDataRuleInput) {
  const updates: string[] = []
  const binds: (string | number | boolean | null)[] = []
  updates.push('siteId = ?')
  if (args.siteId) {
    binds.push(args.siteId)
  } else {
    binds.push(null)
  }
  updates.push('templateId = ?')
  if (args.templateId) {
    const templateId = await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', [args.templateId])
    binds.push(templateId!)
  } else {
    binds.push(null)
  }
  updates.push('path = ?')
  if (args.path) {
    binds.push(args.path)
  } else {
    binds.push('/')
  }
  if (args.grants) {
    if (isNotNull(args.grants.create)) {
      updates.push('`create` = ?')
      binds.push(args.grants.create)
    }
    if (isNotNull(args.grants.update)) {
      updates.push('`update` = ?')
      binds.push(args.grants.update)
    }
    if (isNotNull(args.grants.move)) {
      updates.push('`move` = ?')
      binds.push(args.grants.move)
    }
    if (isNotNull(args.grants.publish)) {
      updates.push('`publish` = ?')
      binds.push(args.grants.publish)
    }
    if (isNotNull(args.grants.unpublish)) {
      updates.push('`unpublish` = ?')
      binds.push(args.grants.unpublish)
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
  return await db.update(`UPDATE datarules
                          SET ${updates.join(', ')}
                          WHERE id = ?`, binds)
}

export async function deleteDataRule (ruleId: string) {
  return await db.delete('DELETE FROM datarules WHERE id = ?', [ruleId])
}
