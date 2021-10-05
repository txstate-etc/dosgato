import db from 'mysql2-async/db'
import { PageTree, PageTreeFilter } from './pagetree.model'
import { unique } from 'txstate-utils'

export async function getPagetreesBySite (siteIds: number[], filter?: PageTreeFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`pagetrees.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.types?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.types)})`)
  }
  where.push(`pagetrees.siteID IN (${db.in(binds, siteIds)})`)
  const pagetrees = await db.getall(`SELECT * from pagetrees
                     WHERE (${where.join(') AND (')})`, binds)
  return pagetrees.map(p => new PageTree(p))
}

export async function getPagetreesByTemplate (templateIds: number[], direct?: boolean) {
  const directBinds: string[] = []
  const directPagetreeQuery = `SELECT pagetrees.*, pagetrees_templates.templateId as templateId FROM pagetrees
                               INNER JOIN pagetrees_templates ON pagetrees.id = pagetrees_templates.pagetreeId
                               WHERE pagetrees_templates.templateId IN (${db.in(directBinds, templateIds)})`
  const pagetrees = await db.getall(directPagetreeQuery, directBinds)
  if (direct) {
    return pagetrees.map(row => ({ key: row.templateId, value: new PageTree(row) }))
  } else {
    const indirectBinds: string[] = []
    const pagetreesThroughSites = await db.getall(`SELECT pagetrees.*, sites_templates.templateId as templateId
                                   FROM pagetrees
                                   INNER JOIN sites ON pagetrees.siteId = sites.id
                                   INNER JOIN sites_templates ON sites.id = sites_templates.siteId
                                   WHERE sites_templates.templateId IN (${db.in(indirectBinds, templateIds)})`, indirectBinds)
    if (typeof direct === 'undefined') {
      const combined = unique([...pagetrees, ...pagetreesThroughSites])
      return combined.map(row => ({ key: row.templateId, value: new PageTree(row) }))
    } else {
      return pagetreesThroughSites.map(row => ({ key: row.templateId, value: new PageTree(row) }))
    }
  }
}
