import db from 'mysql2-async/db'
import { Cache, keyby, eachConcurrent, isNotNull } from 'txstate-utils'
import { TemplateFilter, Template, templateRegistry, Pagetree } from '../internal.js'

const columns = ['templates.id', 'templates.key', 'templates.type', 'templates.deleted', 'templates.universal']

export const universalTemplateCache = new Cache(async () => {
  const templates = (await db.getall('SELECT * FROM templates WHERE universal = 1')).map(row => new Template(row))
  return { all: templates, ...keyby(templates, 'type') }
})

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
  if (isNotNull(filter?.universal)) {
    if (filter?.universal) {
      where.push('templates.universal = 1')
    } else {
      where.push('templates.universal = 0')
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

export async function getTemplatesBySite (siteIds: string[], filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  where.push(`sites_templates.siteId IN (${db.in(binds, siteIds)})`)
  const templates = await db.getall(`SELECT ${columns.join(', ')}, sites_templates.siteId as siteId FROM templates
                           INNER JOIN sites_templates ON templates.id = sites_templates.templateId
                           WHERE (${where.join(') AND (')})`, binds)
  return templates.map(row => ({ key: String(row.siteId), value: new Template(row) }))
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

export async function authorizeForSite (templateId: number, siteId: string) {
  await db.transaction(async db => {
    const sitePagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [siteId])
    // If we are authorizing this template for a whole site, we don't need to authorize it for individual pagetrees within that site.
    const binds: (string | number)[] = [templateId]
    await db.delete(`DELETE FROM pagetrees_templates
                     WHERE templateId = ? AND pagetreeId IN (${db.in(binds, sitePagetreeIds)})`, binds)
    return await db.insert('INSERT INTO sites_templates (templateId, siteId) VALUES(?,?)', [templateId, siteId])
  })
}

export async function authorizeForPagetrees (templateId: number, pagetreeIds: string[]) {
  await db.transaction(async db => {
    const pagetrees = (await db.getall(`SELECT * FROM pagetrees WHERE id IN (${db.in([], pagetreeIds)})`, pagetreeIds)).map((row) => new Pagetree(row))
    const sitePagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [pagetrees[0].siteId])
    // If we are authorizing a template to specific pagetrees, we don't need to authorize it for the whole site
    await db.delete('DELETE FROM sites_templates WHERE templateId = ? AND siteId = ?', [templateId, pagetrees[0].siteId])
    let binds: (string | number)[] = [templateId]
    await db.delete(`DELETE FROM pagetrees_templates WHERE templateId = ? AND pagetreeId IN (${db.in(binds, sitePagetreeIds)})`, binds)

    binds = []
    for (const id of pagetrees.map(p => p.id)) {
      binds.push(templateId, id)
    }
    return await db.insert(`INSERT INTO pagetrees_templates (templateId, pagetreeId) VALUES ${pagetrees.map(p => '(?,?)').join(', ')}`, binds)
  })
}

export async function deauthorizeTemplate (templateId: number, siteId: string) {
  await db.transaction(async d => {
    const pagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [siteId])
    await db.delete('DELETE FROM sites_templates WHERE templateId = ? AND siteId = ?', [templateId, siteId])
    if (pagetreeIds.length) {
      await db.delete(`DELETE FROM pagetrees_templates WHERE templateId = ? AND pagetreeId IN (${db.in([], pagetreeIds)})`, [templateId, ...pagetreeIds])
    }
  })
}

export async function setUniversal (templateId: number, universal: boolean) {
  return await db.update('UPDATE templates SET universal = ? where id = ?', [universal, templateId])
}

export async function syncRegistryWithDB () {
  const templatesInDB = keyby(await db.getall('SELECT * FROM templates'), 'key')
  const registryTemplates = [...templateRegistry.getType('page'), ...templateRegistry.getType('component'), ...templateRegistry.getType('data')]
  const found = new Set<string>()
  await eachConcurrent(registryTemplates, async (template) => {
    if (!templatesInDB[template.templateKey]) {
      console.info(`Adding template ${template.templateKey}`)
      await db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES (?,?,?,?)', [template.templateKey, template.name, template.type, 0])
    } else {
      await db.update('UPDATE templates SET `name`=? WHERE `key`=?', [template.name, template.templateKey])
      found.add(template.templateKey)
    }
  })
  // TODO: This will set deleted = true for all templates in the database NOT added to the template registry.
  // Does anything need to happen with the datarules or datafolders associated with deleted templates?
  // Also need to consider the pagetrees_templates and sites_templates tables. What happens if an allowed template is deleted?
  const notInRegistry = Object.keys(templatesInDB).filter((t) => !found.has(t))
  if (notInRegistry.length > 0) {
    const deleteTemplateBinds: string[] = []
    const numDeleted = await db.update(`UPDATE templates SET deleted = true WHERE \`key\` IN (${db.in(deleteTemplateBinds, notInRegistry)})`, deleteTemplateBinds)
    if (numDeleted > 0) console.info(`${numDeleted} templates marked deleted because they were not found in template registry.`)
  }
}
