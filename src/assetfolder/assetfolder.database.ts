import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { isNotNull } from 'txstate-utils'
import { AssetFolder, AssetFolderFilter, CreateAssetFolderInput } from 'internal'

function processFilters (filter: AssetFolderFilter) {
  const where: any[] = []
  const binds: any[] = []

  if (filter.internalIds?.length) {
    where.push(`assetfolders.id IN (${db.in(binds, filter.internalIds)})`)
  }

  // internalIdPaths for getting direct descendants of an asset folder
  if (filter.internalIdPaths?.length) {
    where.push(`assetfolders.path IN (${db.in(binds, filter.internalIdPaths)})`)
  }

  // internalIdPathsRecursive for getting all descendants of an asset folder
  if (filter.internalIdPathsRecursive?.length) {
    const ors = filter.internalIdPathsRecursive.map(path => 'assetfolders.path LIKE ?')
    where.push(ors.join(' OR '))
    binds.push(...filter.internalIdPathsRecursive.map(p => `${p}%`))
  }

  if (filter.ids?.length) {
    where.push(`assetfolders.guid IN (${db.in(binds, filter.ids)})`)
  }

  if (filter.siteIds?.length) {
    where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }

  if (filter.childOfFolderInternalIds?.length) {
    const ors = filter.childOfFolderInternalIds.map(id => 'assetfolders.path LIKE ?')
    where.push(ors.join(' OR '))
    binds.push(...filter.childOfFolderInternalIds.map(id => `%/${id}`))
  }
  if (filter.root) {
    where.push('assetfolders.path = \'/\'')
  }

  if (isNotNull(filter.deleted)) {
    if (filter.deleted) {
      where.push('assetfolders.deletedAt IS NOT NULL')
    } else {
      where.push('assetfolders.deletedAt IS NULL')
    }
  }

  return { where, binds }
}

export async function getAssetFolders (filter: AssetFolderFilter) {
  const { where, binds } = processFilters(filter)
  return (await db.getall(`
    SELECT *
    FROM assetfolders
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
  `, binds)).map(r => new AssetFolder(r))
}

export async function createAssetFolder (args: CreateAssetFolderInput) {
  return await db.transaction(async db => {
    const parent = new AssetFolder(await db.getrow('SELECT * from assetfolders WHERE guid = ?', [args.parentId]))
    const newInternalId = await db.insert(`
      INSERT INTO assetfolders (siteId, path, name, guid)
      VALUES (?, ?, ?, ?)`, [args.siteId, `/${[...parent.pathSplit, parent.internalId].join('/')}`, args.name, nanoid(10)])
    return new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id=?', [newInternalId]))
  })
}

export async function renameAssetFolder (folderId: string, name: string) {
  return await db.transaction(async db => {
    const id = await db.getval<number>('SELECT id FROM assetfolders WHERE guid = ?', [folderId])
    return await db.update('UPDATE assetfolders SET name = ? WHERE id = ?', [name, id!])
  })
}

export async function moveAssetFolder (id: number, targetFolder: AssetFolder) {
  return await db.transaction(async db => {
    const folder = new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id = ?', [targetFolder.internalId]))
    if (folder.path !== targetFolder.path) throw new Error('Target folder has moved since the mutation began.')
    return await db.update('UPDATE assetfolders SET path = ? WHERE id = ?', [`/${[...targetFolder.pathSplit, targetFolder.internalId].join('/')}`, id])
  })
}

export async function deleteAssetFolder (id: number, userInternalId: number) {
  return await db.update('UPDATE assetfolders SET deletedBy = ?, deletedAt = NOW() WHERE id = ?', [userInternalId, id])
}

export async function undeleteAssetFolder (id: number) {
  return await db.update('UPDATE assetfolders SET deletedBy = null, deletedAt = null WHERE id = ?', [id])
}
