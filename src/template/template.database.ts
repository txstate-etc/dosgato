import db from 'mysql2-async/db'
import { TemplateFilter, Template } from 'internal'

const columns = ['templates.id', 'templates.key', 'templates.name', 'templates.type', 'templates.deleted']

function processFilters (filter?: TemplateFilter) {
  const where: string[] = []
  const binds: string[] = []

  if (filter?.ids?.length) {
    where.push(`templates.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.keys?.length) {
    where.push(`templates.key IN (${db.in(binds, filter.keys)})`)
  }
  if (filter?.names?.length) {
    where.push(`templates.name IN (${db.in(binds, filter.names)})`)
  }
  if (filter?.types?.length) {
    where.push(`templates.type IN (${db.in(binds, filter.types)})`)
  }
  return { where, binds }
}

export async function getTemplates (filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  let query = `SELECT ${columns.join(', ')} FROM templates`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  const templates = await db.getall(query, binds)
  return templates.map(t => new Template(t))
}

export async function getTemplatesBySite (siteIds: string[], filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  where.push(`sites_templates.siteId IN (${db.in(binds, siteIds)})`)
  const sites = await db.getall(`SELECT ${columns.join(', ')}, sites_templates.siteId as siteId FROM templates
                           INNER JOIN sites_templates ON templates.id = sites_templates.templateId
                           WHERE (${where.join(') AND (')})`, binds)
  return sites.map(row => ({ key: String(row.siteId), value: new Template(row) }))
}
