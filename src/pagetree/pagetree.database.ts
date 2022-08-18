import db from 'mysql2-async/db'
import { unique } from 'txstate-utils'
import { PageData } from '@dosgato/templating'
import { Pagetree, PagetreeFilter, PagetreeType, VersionedService, Site, getPageIndexes, createSiteComment, User } from '../internal.js'

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

export async function createPagetree (versionedService: VersionedService, user: User, site: Site, name: string, data: PageData, linkId: string) {
  return await db.transaction(async db => {
    // create the pagetree
    const pagetreeId = await db.insert('INSERT INTO pagetrees (siteId, type, name, createdAt) VALUES (?, ?, ?, NOW())', [site.id, PagetreeType.SANDBOX, name])
    // create the root page for the pagetree
    const indexes = getPageIndexes(data)
    const dataId = await versionedService.create('page', data, indexes, user.id, db)
    await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)`, [site.name, '/', 1, pagetreeId, dataId, linkId])
    await createSiteComment(site.id, `Added sandbox ${name}.`, user.internalId, db)
    return new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE id=?', [pagetreeId]))
  })
}

export async function renamePagetree (pagetreeId: string, name: string) {
  return await db.update('UPDATE pagetrees SET name = ? WHERE id = ?', [name, pagetreeId])
}

export async function promotePagetree (oldPrimaryId: string, newPrimaryId: string) {
  return await db.transaction(async db => {
    await db.update('UPDATE pagetrees SET type = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, oldPrimaryId])
    await db.update('UPDATE pagetrees SET type = ?, promotedAt = NOW() WHERE id = ?', [PagetreeType.PRIMARY, newPrimaryId])
  })
}

export async function archivePagetree (pagetreeId: string) {
  return await db.update('UPDATE pagetrees SET type = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, pagetreeId])
}

export async function deletePagetree (pagetreeId: string, currentUserInternalId: number) {
  return await db.update('UPDATE pagetrees SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [currentUserInternalId, pagetreeId])
}

export async function undeletePagetree (pagetreeId: string) {
  return await db.update('UPDATE pagetrees SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [pagetreeId])
}
