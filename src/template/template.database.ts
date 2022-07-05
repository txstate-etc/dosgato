import db from 'mysql2-async/db'
import { TemplateFilter, Template } from '../internal.js'

const columns = ['templates.id', 'templates.key', 'templates.type', 'templates.deleted']

function processFilters (filter?: TemplateFilter) {
  const where: string[] = ['deleted = 0']
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

export async function getTemplatesByPagetree (pagetreeIds: string[], filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  where.push(`pagetrees_templates.pagetreeId IN (${db.in(binds, pagetreeIds)})`)
  const rows = await db.getall(`SELECT ${columns.join(', ')}, pagetrees_templates.pagetreeId as pagetreeId FROM templates
                                INNER JOIN pagetrees_templates ON templates.id = pagetrees_templates.templateId
                                WHERE (${where.join(') AND (')})`, binds)
  return rows.map(row => ({ key: String(row.pagetreeId), value: new Template(row) }))
}

export async function getTemplatePagePairs (pairs: { pageId: string, templateKey: string }[]) {
  const binds: string[] = []
  return await db.getall<{ pageId: string, templateKey: string }>(`
    SELECT p.dataId as pageId, t.key as templateKey
    FROM pages p
    INNER JOIN pagetrees pt ON pt.id=p.pagetreeId
    INNER JOIN sites s ON s.id=pt.siteId
    INNER JOIN sites_templates st ON s.id=st.siteId
    INNER JOIN templates t ON st.templateId=t.id
    WHERE (p.dataId, t.key) IN (${db.in(binds, pairs.map(p => [p.pageId, p.templateKey]))})
    UNION
    SELECT p.dataId as pageId, t.key as templateKey
    FROM pages p
    INNER JOIN pagetrees_templates ptt ON ptt.pagetreeId=p.pagetreeId
    INNER JOIN templates t ON ptt.templateId=t.id
    WHERE (p.dataId, t.key) IN (${db.in(binds, pairs.map(p => [p.pageId, p.templateKey]))})
  `, binds)
}

export async function authorizeForPagetree (templateId: string, pagetreeId: string) {
  return await db.insert('INSERT INTO pagetrees_templates (templateId, pagetreeId) VALUES (?,?)', [templateId, pagetreeId])
}

export async function deauthorizeForPagetree (templateId: string, pagetreeId: string) {
  return await db.delete('DELETE FROM pagetrees_templates WHERE templateId = ? and pagetreeId = ?', [templateId, pagetreeId])
}

export async function authorizeForSite (templateId: string, siteId: string) {
  return await db.insert('INSERT INTO sites_templates (templateId, siteId) VALUES (?,?)', [templateId, siteId])
}

export async function deauthorizeForSite (templateId: string, siteId: string) {
  return await db.delete('DELETE FROM sites_templates WHERE templateId = ? and siteId = ?', [templateId, siteId])
}

export async function setUniversal (templateId: string, universal: boolean) {
  return await db.update('UPDATE templates SET universal = ? where id = ?', [templateId, universal])
}
