import { Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { isNotBlank, keyby } from 'txstate-utils'
import { AssetFolder, AssetFolderFilter, CreateAssetFolderInput, DeleteState, normalizePath, processDeletedFilters } from '../internal.js'

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
    new Map([
      ['pagetrees', 'INNER JOIN pagetrees ON assetfolders.pagetreeId = pagetrees.id'],
      ['sites', 'INNER JOIN sites ON assetfolders.siteId = sites.id']
    ]),
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
    where.push(`assetfolders.linkId IN (${db.in(binds, [filter.linkIds])})`)
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
    joins.set('pagetrees', 'INNER JOIN pagetrees ON assetfolders.pagetreeId = pagetrees.id')
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
    ORDER BY assetfolders.name
  `, binds)).map(r => new AssetFolder(r))
}

export async function getAssetFoldersByPath (paths: string[], filter: AssetFolderFilter) {
  const folders = await getAssetFolders({ ...filter, paths })
  const parents = await getAssetFolders({ internalIds: [-1, ...folders.flatMap(p => p.pathSplit)] })
  const parentLookup = keyby(parents, 'internalId')
  const ret = folders.map(p => ({ key: '/' + [...p.pathSplit.map(id => parentLookup[id].name), p.name].join('/'), value: p }))
  return ret
}

async function checkForNameConflict (folderId: string, name: string, db: Queryable) {
  const parent = new AssetFolder(await db.getrow('SELECT * from assetfolders WHERE id = ? FOR UPDATE', [folderId]))
  const siblings = await db.getall('SELECT * FROM assetfolders WHERE path=?', [parent.path + '/' + parent.id])
  const assets = await db.getall('SELECT * FROM assets WHERE folderId=?', [parent.id])
  if (siblings.some(s => s.name === name) || assets.some(a => a.name === name)) throw new NameConflictError()
  return parent
}

export async function createAssetFolder (args: CreateAssetFolderInput) {
  return await db.transaction(async db => {
    const parent = await checkForNameConflict(args.parentId, args.name, db)
    const newInternalId = await db.insert(`
      INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name)
      VALUES (?, ?, ?, ?, ?)`, [parent.siteId, parent.pagetreeId, nanoid(10), `/${[...parent.pathSplit, parent.internalId].join('/')}`, args.name])
    return new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id=?', [newInternalId]))
  })
}

export async function renameAssetFolder (folderId: string, name: string) {
  return await db.transaction(async db => {
    const folder = new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id=? LOCK IN SHARE MODE', [folderId]))
    await checkForNameConflict(String(folder.parentInternalId), name, db)
    return await db.update('UPDATE assetfolders SET name = ? WHERE id = ?', [name, folderId])
  })
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
