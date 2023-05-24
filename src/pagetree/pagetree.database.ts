import { type PageData } from '@dosgato/templating'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { unique, isNotBlank } from 'txstate-utils'
import {
  Pagetree, type PagetreeFilter, PagetreeType, type VersionedService, type Site, createSiteComment, type User,
  numerate, createVersionedPage, type CreatePageExtras, DeleteStateNoFinalizeDefault, DeleteStateInputNoFinalize, DeleteStateNoFinalizeAll, numerateBasedOnExisting
} from '../internal.js'

export function processDeletedFiltersNoFinalize (filter: any, tableName: string, orphansJoins: Map<string, string>, excludeOrphansClause: string, onlyOrphansClause: string) {
  const binds: any[] = []
  const where: string[] = []
  let joins = new Map<string, string>()
  let deleteStates = new Set(filter?.deleteStates ?? DeleteStateNoFinalizeDefault)
  if (deleteStates.has(DeleteStateInputNoFinalize.ALL)) deleteStates = new Set(DeleteStateNoFinalizeAll)
  if (
    !deleteStates.has(DeleteStateInputNoFinalize.NOTDELETED) ||
    !deleteStates.has(DeleteStateInputNoFinalize.DELETED) ||
    !deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_NOTDELETED) ||
    !deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_DELETED)
  ) {
    const deleteOrs: any[] = []
    if (deleteStates.has(DeleteStateInputNoFinalize.NOTDELETED) !== deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_NOTDELETED)) {
      joins = orphansJoins
      if (deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_NOTDELETED)) {
        deleteOrs.push(`${tableName}.deletedAt IS NULL${onlyOrphansClause}`)
      } else {
        deleteOrs.push(`${tableName}.deletedAt IS NULL${excludeOrphansClause}`)
      }
    } else {
      if (deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_NOTDELETED)) {
        deleteOrs.push(`${tableName}.deletedAt IS NULL`)
      }
    }
    if (deleteStates.has(DeleteStateInputNoFinalize.DELETED) !== deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_DELETED)) {
      joins = orphansJoins
      if (deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_DELETED)) {
        deleteOrs.push(`${tableName}.deletedAt IS NOT NULL${onlyOrphansClause}`)
      } else {
        deleteOrs.push(`${tableName}.deletedAt IS NOT NULL${excludeOrphansClause}`)
      }
    } else {
      if (deleteStates.has(DeleteStateInputNoFinalize.ORPHAN_DELETED)) {
        deleteOrs.push(`${tableName}.deletedAt IS NOT NULL`)
      }
    }
    where.push(`(${deleteOrs.join(') OR (')})`)
  }
  return { binds, where, joins }
}

function processFilters (filter?: PagetreeFilter) {
  const { binds, where, joins } = processDeletedFiltersNoFinalize(
    filter,
    'pagetrees',
    new Map([
      ['sites', 'INNER JOIN sites ON pagetrees.siteId = sites.id']
    ]),
    ' AND sites.deletedAt IS NULL',
    ' AND sites.deletedAt IS NOT NULL'
  )

  if (filter == null) return { binds, where, joins }
  if (filter.ids?.length) {
    where.push(`pagetrees.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.types?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.types)})`)
  }
  if (filter.siteIds?.length) {
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  return { binds, where, joins }
}

export async function getPagetrees (filter?: PagetreeFilter) {
  const { binds, where, joins } = processFilters(filter)
  const pagetrees = await db.getall(`SELECT pagetrees.* FROM pagetrees
                                     ${Array.from(joins.values()).join('\n')}
                                     WHERE (${where.join(') AND (')})
                                     ORDER BY name`, binds)
  return pagetrees.map(p => new Pagetree(p))
}

export async function getPagetreesById (ids: string[]) {
  return await getPagetrees({ ids, deleteStates: DeleteStateNoFinalizeAll })
}

export async function getPagetreesBySite (siteIds: string[], filter?: PagetreeFilter) {
  return await getPagetrees({ ...filter, siteIds })
}

export async function getPagetreesByTemplate (templateIds: string[], direct?: boolean) {
  const directBinds: string[] = []
  const directPagetreeQuery = `SELECT pagetrees.*, pagetrees_templates.templateId as templateId FROM pagetrees
                               INNER JOIN pagetrees_templates ON pagetrees.id = pagetrees_templates.pagetreeId
                               WHERE pagetrees_templates.templateId IN (${db.in(directBinds, templateIds)})`
  const pagetrees = await db.getall(directPagetreeQuery, directBinds)
  if (direct) {
    return pagetrees.map(row => ({ key: String(row.templateId), value: new Pagetree(row) }))
  } else {
    const indirectBinds: string[] = []
    const pagetreesThroughSites = await db.getall(`SELECT pagetrees.*, sites_templates.templateId as templateId
                                   FROM pagetrees
                                   INNER JOIN sites ON pagetrees.siteId = sites.id
                                   INNER JOIN sites_templates ON sites.id = sites_templates.siteId
                                   WHERE sites_templates.templateId IN (${db.in(indirectBinds, templateIds)})`, indirectBinds)
    if (typeof direct === 'undefined') {
      const combined = unique([...pagetrees, ...pagetreesThroughSites], 'id')
      return combined.map(row => ({ key: String(row.templateId), value: new Pagetree(row) }))
    } else {
      return pagetreesThroughSites.map(row => ({ key: String(row.templateId), value: new Pagetree(row) }))
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
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId, siteId, title, templateKey)
      VALUES (?,?,?,?,?,?,?,?,?)`, [pagetreeName, '/', 1, pagetreeId, dataId, extra?.linkId ?? nanoid(10), site.id, data.title, data.templateKey])
    // create the root asset folder for the pagetree
    await db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?,?,?,?,?)', [site.id, pagetreeId, extra?.linkId ?? nanoid(10), '/', pagetreeName])
    await createSiteComment(site.id, `Added sandbox ${pagetreeName}.`, user.internalId, db)
    // Insert the page template in the list of allowed page templates for the pagetree, unless it is already approved for the whole site.
    const templateId = await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', [data.templateKey])
    const siteAuthorization = await db.getval<number>('SELECT COUNT(*) FROM sites_templates WHERE siteId = ? AND templateId = ?', [site.id, templateId!])
    if (siteAuthorization! === 0) {
      await db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetreeId, templateId!])
    }
    return new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE id=?', [pagetreeId]))
  })
}

export async function renamePagetree (pagetreeId: string, name: string, user: User) {
  await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    await db.update('UPDATE pagetrees SET name = ? WHERE id = ?', [name, pagetreeId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [name, pagetreeId])
    await db.update('UPDATE assetfolders SET name = ? WHERE pagetreeId = ? AND path = "/"', [name, pagetreeId])
    await createSiteComment(pagetree.siteId, `Renamed pagetree. ${pagetree.name} is now ${name}.`, user.internalId, db)
  })
}

export async function promotePagetree (oldPrimaryId: string, newPrimaryId: string, site: Site, user: User) {
  await db.transaction(async db => {
    const [oldPrimaryPagetreeRow, newPrimaryPagetreeRow] = await Promise.all([
      db.getrow('SELECT * FROM pagetrees WHERE ID=?', [oldPrimaryId]),
      db.getrow('SELECT * FROM pagetrees WHERE ID=?', [newPrimaryId])
    ])
    const oldPrimaryPagetree = new Pagetree(oldPrimaryPagetreeRow)
    const newPrimaryPagetree = new Pagetree(newPrimaryPagetreeRow)

    // former primary pagetree will be archived, numerate its name
    const usedNames = await db.getvals<string>('SELECT name FROM pagetrees WHERE siteId = ? AND type = ?', [oldPrimaryPagetree.siteId, PagetreeType.ARCHIVE])
    const pagetreeName = numerateBasedOnExisting(`${site.name}-archive`, usedNames)

    await db.update('UPDATE pagetrees SET type = ?, name = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, pagetreeName, oldPrimaryId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [pagetreeName, oldPrimaryId])
    await db.update('UPDATE pagetrees SET type = ?, name = ?, promotedAt = NOW() WHERE id = ?', [PagetreeType.PRIMARY, site.name, newPrimaryId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path = "/"', [site.name, newPrimaryId])
    await db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [newPrimaryPagetree.id, newPrimaryPagetree.siteId])
    await db.update('UPDATE assetfolders SET name = ? WHERE pagetreeId = ? AND path = "/"', [pagetreeName, oldPrimaryId])
    await db.update('UPDATE assetfolders SET name = ? WHERE pagetreeId = ? AND path = "/"', [site.name, newPrimaryId])
    await createSiteComment(site.id, `Promoted pagetree ${newPrimaryPagetree.name} to primary.`, user.internalId, db)
    await createSiteComment(site.id, `Created new archive ${pagetreeName}.`, user.internalId, db)
  })
}

export async function archivePagetree (pagetreeId: string, user: User) {
  await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    const siteName = await db.getval<string>('SELECT name FROM sites WHERE id = ?', [pagetree.siteId])

    const archiveNames = await db.getvals<string>('SELECT name FROM pagetrees WHERE siteId = ? AND type = ?', [pagetree.siteId, PagetreeType.ARCHIVE])
    const pagetreeName = numerateBasedOnExisting(`${siteName!}-archive`, archiveNames)

    await db.update('UPDATE pagetrees SET type = ?, name = ?, archivedAt = NOW() WHERE id = ?', [PagetreeType.ARCHIVE, pagetreeName, pagetreeId])
    await db.update('UPDATE pages SET name = ? WHERE pagetreeId = ? AND path ="/"', [pagetreeName, pagetreeId])
    await db.update('UPDATE assetfolders SET name = ? WHERE pagetreeId = ? AND path ="/"', [pagetreeName, pagetreeId])
    await createSiteComment(pagetree.siteId, `Created archive ${pagetreeName}`, user.internalId, db)
  })
}

export async function deletePagetree (pagetreeId: string, user: User) {
  await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    if (pagetree.type === PagetreeType.PRIMARY) throw new Error('May not delete the primary pagetree.')
    await db.update('UPDATE pagetrees SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [user.internalId, pagetreeId])
    await createSiteComment(pagetree.siteId, `Deleted pagetree ${pagetree.name}.`, user.internalId, db)
  })
}

export async function undeletePagetree (pagetreeId: string, user: User) {
  await db.transaction(async db => {
    const pagetree = new Pagetree(await db.getrow('SELECT * FROM pagetrees WHERE ID=?', [pagetreeId]))
    await db.update('UPDATE pagetrees SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [pagetreeId])
    await createSiteComment(pagetree.siteId, `Restored pagetree ${pagetree.name}.`, user.internalId, db)
  })
}
