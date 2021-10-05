import db from 'mysql2-async/db'
import { TemplateFilter, Template } from './template.model'

const columns = ['templates.id', 'templates.key', 'templates.name', 'templates.type', 'templates.deleted']

function processFilters (filter?: TemplateFilter) {
  const where: string[] = []
  const binds: string[] = []
  if (typeof filter !== 'undefined') {
    if (filter.keys?.length) {
      where.push(`templates.key IN (${db.in(binds, filter.keys)})`)
    }
    if (filter.names?.length) {
      where.push(`templates.name IN (${db.in(binds, filter.names)})`)
    }
    if (filter.types?.length) {
      where.push(`templates.type IN (${db.in(binds, filter.types)})`)
    }
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
