import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { AssetFolder, AssetFolderFilter, CreateAssetFolderInput, DeleteState, processDeletedFilters } from '../internal.js'

export interface AssetFolderRow {
  id: number
  siteId: number
  path: string
  name: string
  guid: string
  deletedAt?: Date
  deleteState: DeleteState
  deletedBy?: string
}

async function processFilters (filter?: AssetFolderFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'assetfolders',
    new Map([
      ['pagetrees', 'INNER JOIN pagetrees ON assetfolders.pagetreeId = pagetrees.id'],
      ['sites', 'INNER JOIN sites ON assetfolders.siteId = sites.id']
    ]),
    ' AND sites.deletedAt IS NULL AND pagetrees.deletedAt IS NULL',
    ' AND (sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL)'
  )

  if (filter == null) return { where, binds, joins }
  if (filter.internalIds?.length) {
    where.push(`assetfolders.id IN (${db.in(binds, filter.internalIds)})`)
  }

  // internalIdPaths for getting direct descendants of an asset folder
  if (filter.internalIdPaths?.length) {
    where.push(`assetfolders.path IN (${db.in(binds, filter.internalIdPaths)})`)
  }

  // internalIdPathsRecursive for getting all descendants of an asset folder
  if (filter.internalIdPathsRecursive?.length) {
    const ors = filter.internalIdPathsRecursive.flatMap(path => ['assetfolders.path LIKE ?', 'assetfolders.path = ?'])
    where.push(ors.join(' OR '))
    binds.push(...filter.internalIdPathsRecursive.flatMap(p => [`${p}/%`, p]))
  }

  if (filter.ids?.length) {
    where.push(`assetfolders.guid IN (${db.in(binds, filter.ids)})`)
  }

  if (filter.siteIds?.length) {
    where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }

  if (filter.pagetreeIds?.length) {
    where.push(`assetfolders.pagetreeId IN (${db.in(binds, filter.pagetreeIds)})`)
  }

  if (filter.pagetreeTypes?.length) {
    joins.set('pagetrees', 'INNER JOIN pagetrees ON pages.pagetreeId = pagetrees.id')
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
  }

  if (filter.maxDepth === 0) {
    where.push('assetfolders.path = "/"')
  } else if (filter.maxDepth != null) {
    where.push('LENGTH(assetfolders.path) - LENGTH(REPLACE(assetfolders.path, "/", "")) <= ?')
    binds.push(filter.maxDepth)
  }

  if (filter.childOfFolderInternalIds?.length) {
    const ors = filter.childOfFolderInternalIds.map(id => 'assetfolders.path LIKE ?')
    where.push(ors.join(' OR '))
    binds.push(...filter.childOfFolderInternalIds.map(id => `%/${id}`))
  }

  if (filter.names?.length) {
    where.push(`assetfolders.name IN (${db.in(binds, filter.names)})`)
  }

  if (filter.root) {
    where.push('assetfolders.path = \'/\'')
  }

  return { joins, where, binds }
}

export async function getAssetFolders (filter?: AssetFolderFilter) {
  const { joins, where, binds } = await processFilters(filter)
  return (await db.getall(`
    SELECT assetfolders.*
    FROM assetfolders
    ${Array.from(joins.values()).join('\n')}
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
  `, binds)).map(r => new AssetFolder(r))
}

export async function createAssetFolder (args: CreateAssetFolderInput) {
  return await db.transaction(async db => {
    const parent = new AssetFolder(await db.getrow('SELECT * from assetfolders WHERE guid = ?', [args.parentId]))
    const newInternalId = await db.insert(`
      INSERT INTO assetfolders (siteId, pagetreeId, path, name, guid)
      VALUES (?, ?, ?, ?, ?)`, [parent.siteId, parent.pagetreeId, `/${[...parent.pathSplit, parent.internalId].join('/')}`, args.name, nanoid(10)])
    return new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id=?', [newInternalId]))
  })
}

export async function renameAssetFolder (folderId: string, name: string) {
  return await db.update('UPDATE assetfolders SET name = ? WHERE guid = ?', [name, folderId])
}

export async function deleteAssetFolder (id: number, userInternalId: number) {
  return await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ?', [id, `%/${id}%`])
    const binds: number[] = [userInternalId, DeleteState.MARKEDFORDELETE]
    await db.update(`UPDATE assetfolders SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE id IN (${db.in(binds, folderIds)})`, binds)
    await db.update(`UPDATE assets SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE folderId IN (${db.in(binds, folderIds)})`, binds)
  })
}

export async function finalizeAssetFolderDeletion (id: number, userInternalId: number) {
  return await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ?', [id, `%/${id}%`])
    const binds: number[] = [userInternalId, DeleteState.DELETED]
    await db.update(`UPDATE assetfolders SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE id IN (${db.in(binds, folderIds)})`, binds)
    await db.update(`UPDATE assets SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE folderId IN (${db.in([], folderIds)})`, binds)
  })
}

export async function undeleteAssetFolder (id: number) {
  return await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ?', [id, `%/${id}%`])
    const binds: number[] = [DeleteState.NOTDELETED]
    await db.update(`UPDATE assetfolders SET deletedBy = null, deletedAt = null, deleteState = ? WHERE id IN (${db.in(binds, folderIds)})`, binds)
    await db.update(`UPDATE assets SET deletedBy = null, deletedAt = null, deleteState = ? WHERE folderId IN (${db.in([], folderIds)})`, binds)
  })
}
