import db from 'mysql2-async/db'
import { keyby, eachConcurrent, isNotNull, unique } from 'txstate-utils'
import { type TemplateFilter, Template, templateRegistry, type Pagetree, createSiteComment, type Site } from '../internal.js'

const columns = ['templates.id', 'templates.key', 'templates.type', 'templates.deleted', 'templates.universal']
const columnsjoined = columns.join(', ')

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
  let query = `SELECT ${columnsjoined} FROM templates`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  query += ' ORDER BY name'
  const templates = await db.getall(query, binds)
  return templates.map(t => new Template(t))
}

export async function getTemplatesBySite (siteIds: string[], filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  where.push(`sites_templates.siteId IN (${db.in(binds, siteIds)}) OR templates.universal=1`)
  where.push('templates.type IN ("page", "component")')
  const templates = await db.getall(`SELECT ${columnsjoined}, sites_templates.siteId as siteId FROM templates
                           LEFT JOIN sites_templates ON templates.id = sites_templates.templateId
                           WHERE (${where.join(') AND (')})
                           ORDER BY name`, binds)
  return unique(templates.flatMap(row => {
    const t = new Template(row)
    if (row.universal) return siteIds.map(sId => ({ key: sId, value: t }))
    else return [{ key: String(row.siteId), value: new Template(row) }]
  }), entry => entry.key + '-' + entry.value.key)
}

export async function getTemplatesByPagetree (pagetreeIds: string[], filter?: TemplateFilter) {
  const { where, binds } = processFilters(filter)
  where.push(`pagetrees_templates.pagetreeId IN (${db.in(binds, pagetreeIds)}) OR templates.universal=1`)
  where.push('templates.type IN ("page", "component")')
  const rows = await db.getall(`SELECT ${columnsjoined}, pagetrees_templates.pagetreeId as pagetreeId FROM templates
                                LEFT JOIN pagetrees_templates ON templates.id = pagetrees_templates.templateId
                                WHERE (${where.join(') AND (')})
                                ORDER BY name`, binds)
  return unique(rows.flatMap(row => {
    const t = new Template(row)
    if (row.universal) return pagetreeIds.map(pId => ({ key: pId, value: t }))
    else return [{ key: String(row.pagetreeId), value: new Template(row) }]
  }), entry => entry.key + '-' + entry.value.key)
}

export async function getTemplatePagetreePairs (pairs: { pagetreeId: string, templateKey: string }[]) {
  const binds: string[] = []
  return await db.getall<{ pagetreeId: number, templateKey: string }>(`
    SELECT pt.id as pagetreeId, t.key as templateKey
    FROM pagetrees pt
    INNER JOIN sites s ON s.id=pt.siteId
    INNER JOIN sites_templates st ON s.id=st.siteId
    INNER JOIN templates t ON st.templateId=t.id
    WHERE (pt.id, t.key) IN (${db.in(binds, pairs.map(p => [p.pagetreeId, p.templateKey]))})
    UNION
    SELECT ptt.pagetreeId, t.key as templateKey
    FROM pagetrees_templates ptt
    INNER JOIN templates t ON ptt.templateId=t.id
    WHERE (ptt.pagetreeId, t.key) IN (${db.in(binds, pairs.map(p => [p.pagetreeId, p.templateKey]))})
  `, binds)
}

export async function authorizeForSite (template: Template, site: Site, userInternalId: number) {
  await db.transaction(async db => {
    const sitePagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [site.id])
    // If we are authorizing this template for a whole site, we don't need to authorize it for individual pagetrees within that site.
    const binds: (string | number)[] = [template.id]
    await db.delete(`DELETE FROM pagetrees_templates
                     WHERE templateId = ? AND pagetreeId IN (${db.in(binds, sitePagetreeIds)})`, binds)
    await db.insert('INSERT INTO sites_templates (templateId, siteId) VALUES(?,?)', [template.id, site.id])
    await createSiteComment(site.id, `Authorized ${template.name} for all pagetrees`, userInternalId, db)
  }, { retries: 2 })
}

export async function authorizeForPagetrees (template: Template, pagetrees: Pagetree[], userInternalId: number) {
  await db.transaction(async db => {
    const sitePagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [pagetrees[0].siteId])
    // If we are authorizing a template to specific pagetrees, we don't need to authorize it for the whole site
    await db.delete('DELETE FROM sites_templates WHERE templateId = ? AND siteId = ?', [template.id, pagetrees[0].siteId])
    let binds: (string | number)[] = [template.id]
    await db.delete(`DELETE FROM pagetrees_templates WHERE templateId = ? AND pagetreeId IN (${db.in(binds, sitePagetreeIds)})`, binds)

    binds = []
    for (const id of pagetrees.map(p => p.id)) {
      binds.push(template.id, id)
    }
    await db.insert(`INSERT INTO pagetrees_templates (templateId, pagetreeId) VALUES ${pagetrees.map(p => '(?,?)').join(', ')}`, binds)
    const auditMessage = `Authorized ${template.name} for pagetrees ${pagetrees.map(p => p.name).join(', ')}`
    await createSiteComment(pagetrees[0].siteId, auditMessage, userInternalId, db)
  }, { retries: 2 })
}

export async function deauthorizeTemplate (template: Template, site: Site, userInternalId: number) {
  await db.transaction(async d => {
    const pagetreeIds = await db.getvals<number>('SELECT id FROM pagetrees WHERE siteId = ?', [site.id])
    await db.delete('DELETE FROM sites_templates WHERE templateId = ? AND siteId = ?', [template.id, site.id])
    if (pagetreeIds.length) {
      await db.delete(`DELETE FROM pagetrees_templates WHERE templateId = ? AND pagetreeId IN (${db.in([], pagetreeIds)})`, [template.id, ...pagetreeIds])
    }
    await createSiteComment(site.id, `Deauthorized ${template.name} for all pagetrees`, userInternalId, db)
  }, { retries: 2 })
}

export async function setUniversal (templateId: string, universal: boolean) {
  return await db.update('UPDATE templates SET universal = ? where id = ?', [universal, templateId])
}

export async function syncRegistryWithDB () {
  const templatesInDB = keyby(await db.getall('SELECT * FROM templates'), 'key')
  const registryTemplates = [...templateRegistry.getType('page'), ...templateRegistry.getType('component'), ...templateRegistry.getType('data')]
  const found = new Set<string>()
  await eachConcurrent(registryTemplates, async (template) => {
    if (!templatesInDB[template.templateKey]) {
      console.info(`Adding template ${template.templateKey}`)
      await db.insert('INSERT INTO templates (`key`, `name`, `type`, `universal`, `deleted`) VALUES (?,?,?,?,0)', [template.templateKey, template.name, template.type, template.type === 'component' ? 1 : 0])
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
