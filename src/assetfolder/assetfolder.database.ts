import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { isNotBlank, keyby } from 'txstate-utils'
import { AssetFolder, type AssetFolderFilter, type CreateAssetFolderInput, DeleteState, normalizePath, processDeletedFilters, shiftPath } from '../internal.js'
import { DateTime } from 'luxon'

export interface AssetFolderRow {
  id: number
  siteId: number
  path: string
  name: string
  linkId: string
  deletedAt?: Date
  deleteState: DeleteState
  deletedBy?: string
  pagetreeId: number
}

export class NameConflictError extends Error {
  constructor (message?: string) {
    super(message ?? 'Name is not available.')
  }
}

async function convertPathsToIDPaths (pathstrings: string[]) {
  const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
  const names = new Set<string>(paths.flat())
  const binds: string[] = []
  const rows = names.size ? await db.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM assetfolders WHERE name IN (${db.in(binds, Array.from(names))})`, binds) : []
  const rowsByNameAndIDPath: Record<string, Record<string, typeof rows[number]>> = {}
  for (const row of rows) {
    rowsByNameAndIDPath[row.name] ??= {}
    rowsByNameAndIDPath[row.name][row.path] = row
  }
  const idpaths: string[] = []
  for (const entry of paths) {
    let lastpath = '/'
    let finished = false
    for (let i = 0; i < entry.length; i++) {
      const segment = entry[i]
      const folder = rowsByNameAndIDPath[segment]?.[lastpath]
      if (!folder) break
      lastpath = `${folder.path}${folder.path === '/' ? '' : '/'}${folder.id}`
      finished = (i === entry.length - 1)
    }
    if ((finished && lastpath !== '/') || entry.length === 0) idpaths.push(lastpath)
  }
  return idpaths
}

async function processFilters (filter?: AssetFolderFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'assetfolders',
    new Map([]),
    ' AND sites.deletedAt IS NULL AND pagetrees.deletedAt IS NULL',
    ' AND (sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL)'
  )

  if (filter == null) return { where, binds, joins }

  const awaitables: Promise<void>[] = []
  // named paths e.g. /site1/about
  if (filter.paths?.length) {
    awaitables.push((async () => {
      const idpaths = await convertPathsToIDPaths(filter.paths!)
      const ids = ['-1', ...idpaths.map(p => p.split(/\//).slice(-1)[0])]
      where.push(`assetfolders.id IN (${db.in(binds, ids)})`)
    })())
  }
  // beneath a named path e.g. /site1/about
  if (filter.beneath?.length) {
    awaitables.push((async () => {
      const idpaths = await convertPathsToIDPaths(filter.beneath!)
      const ors = idpaths.flatMap(p => ['assetfolders.path LIKE ?', 'assetfolders.path = ?'])
      binds.push(...idpaths.flatMap(p => [`${p}/%`, p]))
      where.push(ors.join(' OR '))
    })())
  }
  // direct children of a named path e.g. /site1/about
  if (filter.parentPaths?.length) {
    awaitables.push((async () => {
      const idpaths = await convertPathsToIDPaths(filter.parentPaths!)
      where.push(`assetfolders.path IN (${db.in(binds, idpaths)})`)
    })())
  }
  if (awaitables.length > 0) await Promise.all(awaitables)

  if (filter.internalIds?.length || filter.ids?.length) {
    where.push(`assetfolders.id IN (${db.in(binds, [...(filter.internalIds ?? []), ...(filter.ids ?? [])])})`)
  }

  if (filter.linkIds?.length) {
    where.push(`assetfolders.linkId IN (${db.in(binds, filter.linkIds)})`)
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

  if (filter.siteIds?.length) {
    where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }

  if (filter.pagetreeIds?.length) {
    where.push(`assetfolders.pagetreeId IN (${db.in(binds, filter.pagetreeIds)})`)
  }

  if (filter.pagetreeTypes?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
  }

  if (filter.launchStates?.length) {
    where.push(`sites.launchEnabled IN (${db.in(binds, filter.launchStates)})`)
  }

  if (filter.maxDepth === 0) {
    where.push('assetfolders.path = "/"')
  } else if (filter.maxDepth != null) {
    where.push('LENGTH(assetfolders.path) - LENGTH(REPLACE(assetfolders.path, "/", "")) <= ?')
    binds.push(filter.maxDepth)
  }

  // direct children of an id
  if (filter.childOfFolderIds?.length) {
    joins.set('parent', 'INNER JOIN assetfolders parent ON assetfolders.path = CONCAT(parent.path, "/", parent.id)')
    where.push(`parent.id IN (${db.in(binds, filter.childOfFolderIds)})`)
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
  const assetfolders = (await db.getall(`
    SELECT assetfolders.*, sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL as orphaned,
      pagetrees.type as pagetreeType, sites.name as siteName
    FROM assetfolders
    INNER JOIN pagetrees ON assetfolders.pagetreeId = pagetrees.id
    INNER JOIN sites ON assetfolders.siteId = sites.id
    ${Array.from(joins.values()).join('\n')}
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
    ORDER BY assetfolders.name
  `, binds)).map(r => new AssetFolder(r))
  const ancestorIds = new Set<number>()
  for (const f of assetfolders) {
    for (const id of f.pathSplit) ancestorIds.add(id)
  }
  const abinds: number[] = []
  const ancestorrows = ancestorIds.size ? await db.getall<{ id: number, name: string }>(`SELECT id, name FROM assetfolders WHERE id IN (${db.in(abinds, Array.from(ancestorIds))})`, abinds) : []
  const namesById = keyby(ancestorrows, 'id')
  for (const f of assetfolders) {
    f.resolvedPath = `/${f.pathSplit.map(id => namesById[id].name).join('/')}${f.pathSplit.length ? '/' : ''}${f.name}`
    f.resolvedPathWithoutSitename = shiftPath(f.resolvedPath)
  }
  return assetfolders
}

export async function getAssetFoldersByPath (paths: string[], filter: AssetFolderFilter) {
  const folders = await getAssetFolders({ ...filter, paths })
  const parents = await getAssetFolders({ internalIds: [-1, ...folders.flatMap(p => p.pathSplit)] })
  const parentLookup = keyby(parents, 'internalId')
  const ret = folders.map(p => ({ key: '/' + [...p.pathSplit.map(id => parentLookup[id].name), p.name].join('/'), value: p }))
  return ret
}

export async function checkForAssetNameConflict (folderId: string, name: string, tdb: Queryable = db) {
  const parent = (await tdb.getrow<{ id: number, path: string, siteId: number, pagetreeId: number }>('SELECT id, path, siteId, pagetreeId from assetfolders WHERE id = ? FOR UPDATE', [folderId]))!
  const siblings = await tdb.getall('SELECT name FROM assetfolders WHERE path=?', [parent.path + (parent.path === '/' ? '' : '/') + parent.id])
  const assets = await tdb.getall('SELECT * FROM assets WHERE folderId=?', [parent.id])
  if ([...siblings, ...assets].some(s => s.name.toLocaleLowerCase() === name)) throw new NameConflictError()
  return parent
}

export async function createAssetFolder (args: CreateAssetFolderInput) {
  const newInternalId = await db.transaction(async db => {
    const parent = await checkForAssetNameConflict(args.parentId, args.name, db)
    return await db.insert(`
      INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name)
      VALUES (?, ?, ?, ?, ?)`, [parent.siteId, parent.pagetreeId, nanoid(10), parent.path + (parent.path === '/' ? '' : '/') + parent.id, args.name])
  })
  return (await getAssetFolders({ internalIds: [newInternalId] }))[0]
}

export async function renameAssetFolder (folderId: string, name: string) {
  return await db.transaction(async db => {
    const folderPath = await db.getval<string>('SELECT path FROM assetfolders WHERE id=? LOCK IN SHARE MODE', [folderId])
    await checkForAssetNameConflict(folderPath!.split('/').slice(-1)[0], name, db)
    return await db.update('UPDATE assetfolders SET name = ? WHERE id = ?', [name, folderId])
  })
}

export async function deleteAssetFolder (id: number, userInternalId: number) {
  await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ? OR path like ?', [id, `%/${id}/%`, `%/${id}`])
    const binds: number[] = [userInternalId, DeleteState.MARKEDFORDELETE]
    await db.update(`UPDATE assetfolders SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE id IN (${db.in(binds, folderIds)})`, binds)
    await db.update(`UPDATE assets SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE folderId IN (${db.in(binds, folderIds)})`, binds)
  })
}

export async function finalizeAssetFolderDeletion (id: number, userInternalId: number) {
  const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
  await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ? OR path like ?', [id, `%/${id}/%`, `%/${id}`])
    const binds: number[] = [userInternalId, DeleteState.DELETED]
    async function update () {
      await db.update(`UPDATE assetfolders SET linkId=LEFT(MD5(RAND()), 10), deletedBy = ?, deletedAt = NOW(), deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE id IN (${db.in(binds, folderIds)})`, binds)
      await db.update(`UPDATE assets SET linkId=LEFT(MD5(RAND()), 10), deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE folderId IN (${db.in([], folderIds)})`, binds)
    }
    try {
      await update()
    } catch (e: any) {
      if (e.code !== 1062) throw e
      // if we got a duplicate key error, try again and it will generate new linkIds
      await update()
    }
  })
}
export async function undeleteAssetFolder (id: number) {
  await db.transaction(async db => {
    const folderIds = await db.getvals<number>('SELECT id FROM assetfolders WHERE id = ? OR path like ? OR path like ?', [id, `%/${id}/%`, `%/${id}`])
    const binds: number[] = [DeleteState.NOTDELETED]
    await db.update(`UPDATE assetfolders SET deletedBy = null, deletedAt = null, deleteState = ? WHERE id IN (${db.in(binds, folderIds)})`, binds)
    await db.update(`UPDATE assets SET deletedBy = null, deletedAt = null, deleteState = ? WHERE folderId IN (${db.in([], folderIds)})`, binds)
  })
}
