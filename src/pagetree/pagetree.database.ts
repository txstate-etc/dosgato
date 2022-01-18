import db from 'mysql2-async/db'
import { unique } from 'txstate-utils'
import { Pagetree, PagetreeFilter, PagetreeType } from 'internal'

function processFilters (filter?: PagetreeFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`pagetrees.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.types?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.types)})`)
  }
  return { binds, where }
}

export async function getPagetreesById (ids: string[]) {
  const { binds, where } = processFilters({ ids })
  const pagetrees = await db.getall(`SELECT * FROM pagetrees
                                     WHERE (${where.join(') AND (')})`, binds)
  return pagetrees.map(p => new Pagetree(p))
}

export async function getPagetreesBySite (siteIds: string[], filter?: PagetreeFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`pagetrees.siteID IN (${db.in(binds, siteIds)})`)
  const pagetrees = await db.getall(`SELECT * from pagetrees
                     WHERE (${where.join(') AND (')})`, binds)
  return pagetrees.map(p => new Pagetree(p))
}

export async function getPagetreesByTemplate (templateIds: number[], direct?: boolean) {
  const directBinds: string[] = []
  const directPagetreeQuery = `SELECT pagetrees.*, pagetrees_templates.templateId as templateId FROM pagetrees
                               INNER JOIN pagetrees_templates ON pagetrees.id = pagetrees_templates.pagetreeId
                               WHERE pagetrees_templates.templateId IN (${db.in(directBinds, templateIds)})`
  const pagetrees = await db.getall(directPagetreeQuery, directBinds)
  if (direct) {
    return pagetrees.map(row => ({ key: row.templateId, value: new Pagetree(row) }))
  } else {
    const indirectBinds: string[] = []
    const pagetreesThroughSites = await db.getall(`SELECT pagetrees.*, sites_templates.templateId as templateId
                                   FROM pagetrees
                                   INNER JOIN sites ON pagetrees.siteId = sites.id
                                   INNER JOIN sites_templates ON sites.id = sites_templates.siteId
                                   WHERE sites_templates.templateId IN (${db.in(indirectBinds, templateIds)})`, indirectBinds)
    if (typeof direct === 'undefined') {
      const combined = unique([...pagetrees, ...pagetreesThroughSites], 'id')
      return combined.map(row => ({ key: row.templateId, value: new Pagetree(row) }))
    } else {
      return pagetreesThroughSites.map(row => ({ key: row.templateId, value: new Pagetree(row) }))
    }
  }
}

export async function renamePagetree (pagetreeId: string, name: string) {
  return await db.update('UPDATE pagetrees SET name = ? WHERE id = ?', [name, pagetreeId])
}

export async function promotePagetree (oldPrimaryId: string, newPrimaryId: string) {
  return await db.transaction(async db => {
    await db.update('UPDATE pagetrees SET type = ? WHERE id = ?', [PagetreeType.ARCHIVE, oldPrimaryId])
    await db.update('UPDATE pagetrees SET type = ? WHERE id = ?', [PagetreeType.PRIMARY, newPrimaryId])
  })
}

export async function deletePagetree (pagetreeId: string) {

}
