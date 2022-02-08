import db from 'mysql2-async/db'
import { TemplateRule, TemplateRuleFilter, CreateTemplateRuleInput, UpdateTemplateRuleInput } from 'internal'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: TemplateRuleFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins: string[] = []
  if (filter.ids?.length) {
    where.push(`templaterules.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.roleIds?.length) {
    where.push(`templaterules.roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter.templateIds?.length) {
    const ors = []
    if (filter.templateIds.some(id => !id)) ors.push('templaterules.templateId IS NULL')
    const templateIds = filter.templateIds.filter(isNotNull)
    if (templateIds.length) ors.push(`templaterules.templateId IN (${db.in(binds, templateIds)})`)
    where.push(ors.join('OR'))
  }
  if (filter.templateKeys?.length) {
    if (filter.templateKeys.includes(null)) {
      where.push(`(templates.key IN (${db.in(binds, filter.templateKeys)}) OR templaterules.templateId IS NULL)`)
    } else {
      where.push(`templates.key IN (${db.in(binds, filter.templateKeys)})`)
    }
    joins.push('LEFT JOIN templates ON templaterules.templateId = templates.id')
  }
  if (filter.use) {
    where.push('`use` IS TRUE')
  }
  return { binds, where, joins }
}

export async function getTemplateRules (filter: TemplateRuleFilter) {
  const { binds, where, joins } = processFilters(filter)
  const rules = await db.getall(`SELECT templaterules.* FROM templaterules
                                 ${joins.join('\n')}
                                 WHERE (${where.join(') AND (')})`, binds)
  return rules.map(row => new TemplateRule(row))
}

export async function createTemplateRule (args: CreateTemplateRuleInput) {
  const columns: string[] = ['roleId']
  const binds: (string|boolean)[] = []
  if (!args.roleId) {
    throw new Error('Must include a role ID when creating a template rule')
  }
  binds.push(args.roleId)
  if (args.templateId) {
    columns.push('templateId')
    binds.push(args.templateId)
  }
  if (args.grants?.use) {
    columns.push('`use`')
    binds.push(args.grants.use)
  }
  return await db.insert(`INSERT INTO templaterules (${columns.join(',')}) VALUES(${columns.map(c => '?').join(',')})`, binds)
}

export async function updateTemplateRule (args: UpdateTemplateRuleInput) {
  const updates: string[] = []
  const binds: (string|boolean)[] = []
  if (typeof args.templateId !== 'undefined') {
    updates.push('templateId = ?')
    binds.push(args.templateId)
  }
  if (isNotNull(args.grants?.use)) {
    updates.push('`use` = ?')
    binds.push(args.grants!.use)
  }
  binds.push(String(args.ruleId))
  return await db.update(`UPDATE templaterules
                          SET ${updates.join(', ')}
                          WHERE id = ?`, binds)
}

export async function deleteTemplateRule (ruleId: string) {
  return await db.delete('DELETE FROM templaterules WHERE id = ?', [ruleId])
}
