import db from 'mysql2-async/db'
import { unique, isNotBlank } from 'txstate-utils'
import { PageData } from '@dosgato/templating'
import { Pagetree, PagetreeFilter, PagetreeType, VersionedService, Site, createSiteComment, User, DeletedFilter, numerate, createVersionedPage, CreatePageExtras } from '../internal.js'
import { nanoid } from 'nanoid'

function processFilters (filter?: PagetreeFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`pagetrees.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.types?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.types)})`)
  }
  if (filter?.deleted) {
    if (filter.deleted === DeletedFilter.ONLY) {
      where.push('pagetrees.deletedAt IS NOT NULL')
    } else if (filter.deleted === DeletedFilter.HIDE) {
      where.push('pagetrees.deletedAt IS NULL')
    }
  } else {
    where.push('pagetrees.deletedAt IS NULL')
  }
  return { binds, where }
}

export async function getPagetreesById (ids: string[]) {
  const { binds, where } = processFilters({ ids, deleted: DeletedFilter.SHOW })
  const pagetrees = await db.getall(`SELECT * FROM pagetrees
                                     WHERE (${where.join(') AND (')})`, binds)
  return pagetrees.map(p => new Pagetree(p))
}

export async function getPagetreesBySite (siteIds: string[], filter?: PagetreeFilter) {
  const { binds, where } = processFilters(filter)
  where.push(`pagetrees.siteID IN (${db.in(binds, siteIds)})`)
  const pagetrees = await db.getall(`SELECT * from pagetrees
                     WHERE (${where.join(') AND (')}) ORDER BY type`, binds)
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

export async function createPagetree (versionedService: VersionedService, user: User, site: Site, data: PageData, extra?: CreatePageExtras) {
  return await db.transaction(async db => {
    // numerate pagetree names
    const usedNames = new Set(await db.getvals<string>('SELECT name FROM pagetrees WHERE siteId = ? AND type = ?', [site.id, PagetreeType.SANDBOX]))
    let pagetreeName = `${site.name}-sandbox`
    while (usedNames.has(pagetreeName)) pagetreeName = numerate(pagetreeName)
    // create the pagetree
    const createdAt = data.legacyId && isNotBlank(extra?.createdAt) ? new Date(extra!.createdAt) : new Date()
    const pagetreeId = await db.insert('INSERT INTO pagetrees (siteId, type, name, createdAt) VALUES (?, ?, ?, ?)', [site.id, PagetreeType.SANDBOX, pagetreeName, createdAt])
    // create the root page for the pagetree
    const dataId = await createVersionedPage(versionedService, user.id, data, db, extra)
    await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)`, [pagetreeName, '/', 1, pagetreeId, dataId, extra?.linkId ?? nanoid(10)])
    await createSiteComment(site.id, `Added sandbox ${pagetreeName}.`, user.internalId, db)
    return new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE id=?', [pagetreeId]))
  })
}

export async function renamePagetree (pagetreeId: string, name: string, user: User) {
  return await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    await db.update('UPDATE pagetrees SET name = ? WHERE id = ?', [name, pagetreeId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [name, pagetreeId])
    await createSiteComment(pagetree.siteId, `Renamed pagetree. ${pagetree.name} is now ${name}.`, user.internalId, db)
  })
}

export async function promotePagetree (oldPrimaryId: string, newPrimaryId: string, site: Site, user: User) {
  return await db.transaction(async db => {
    const [oldPrimaryPagetreeRow, newPrimaryPagetreeRow] = await Promise.all([
      db.getrow('SELECT * FROM pagetrees WHERE ID=?', [oldPrimaryId]),
      db.getrow('SELECT * FROM pagetrees WHERE ID=?', [newPrimaryId])
    ])
    const oldPrimaryPagetree = new Pagetree(oldPrimaryPagetreeRow)
    const newPrimaryPagetree = new Pagetree(newPrimaryPagetreeRow)

    // former primary pagetree will be archived, numerate its name
    const usedNames = new Set(await db.getvals<string>('SELECT name FROM pagetrees WHERE siteId = ? AND type = ?', [oldPrimaryPagetree.siteId, PagetreeType.ARCHIVE]))
    let pagetreeName = `${site.name}-archive`
    while (usedNames.has(pagetreeName)) pagetreeName = numerate(pagetreeName)

    await db.update('UPDATE pagetrees SET type = ?, name = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, pagetreeName, oldPrimaryId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [pagetreeName, oldPrimaryId])
    await db.update('UPDATE pagetrees SET type = ?, name = ?, promotedAt = NOW() WHERE id = ?', [PagetreeType.PRIMARY, site.name, newPrimaryId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [site.name, newPrimaryId])
    await db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [newPrimaryPagetree.id, newPrimaryPagetree.siteId])
    await createSiteComment(site.id, `Promoted pagetree ${newPrimaryPagetree.name} to primary.`, user.internalId, db)
    await createSiteComment(site.id, `Created new archive ${pagetreeName}.`, user.internalId, db)
  })
}

export async function archivePagetree (pagetreeId: string, user: User) {
  return await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    const siteName = await db.getval<string>('SELECT name FROM sites WHERE id = ?', [pagetree.siteId])

    const archiveNames = new Set(await db.getvals<string>('SELECT name FROM pagetrees WHERE siteId = ? AND type = ?', [pagetree.siteId, PagetreeType.ARCHIVE]))
    let pagetreeName = `${siteName!}-archive`
    while (archiveNames.has(pagetreeName)) pagetreeName = numerate(pagetreeName)

    await db.update('UPDATE pagetrees SET type = ?, name = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, pagetreeName, pagetreeId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path ="/"', [pagetreeName, pagetreeId])
    await createSiteComment(pagetree.siteId, `Created archive ${pagetreeName}`, user.internalId, db)
  })
}

export async function deletePagetree (pagetreeId: string, user: User) {
  return await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    await db.update('UPDATE pagetrees SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [user.internalId, pagetreeId])
    await createSiteComment(pagetree.siteId, `Deleted pagetree ${pagetree.name}.`, user.internalId, db)
  })
}

export async function undeletePagetree (pagetreeId: string, user: User) {
  return await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    await db.update('UPDATE pagetrees SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [pagetreeId])
    await createSiteComment(pagetree.siteId, `Restored pagetree ${pagetree.name}.`, user.internalId, db)
  })
}
