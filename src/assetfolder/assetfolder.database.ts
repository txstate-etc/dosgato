import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { AssetFolder, AssetFolderFilter, CreateAssetFolderInput } from 'internal'

export async function getAssetFolders (filter: AssetFolderFilter) {
  const where: any[] = []
  const binds: any[] = []
  if (filter.ids?.length) {
    where.push(`guid IN (${db.in(binds, filter.ids)})`)
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
