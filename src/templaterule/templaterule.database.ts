import db from 'mysql2-async/db'
import { TemplateRule, TemplateRuleFilter } from './templaterule.model'

function processFilters (filter: TemplateRuleFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins: string[] = []
  if (filter.roleIds?.length) {
    where.push(`templaterules.roleId IN (${db.in(binds, filter.roleIds)})`)
  }
  if (filter.templateKeys?.length) {
    // TODO: handle the case where null is passed in as a template key
    where.push(`templates.key IN (${db.in(binds, filter.templateKeys)})`)
    joins.push('INNER JOIN templates ON templaterules.templateId = templates.id')
  }
  if (filter.use) {
    where.push('`use` IS TRUE')
  }
  return { binds, where, joins }
}

export async function getTemplateRules (filter: TemplateRuleFilter) {
  const { binds, where, joins } = processFilters(filter)
  const rules = await db.getall(`SELECT * FROM templaterules
                                 ${joins.join('\n')}
                                 WHERE (${where.join(') AND (')})`, binds)
  return rules.map(row => new TemplateRule(row))
}
