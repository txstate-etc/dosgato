import db from 'mysql2-async/db'
import { AssetFolder, AssetFolderFilter } from 'internal'

export async function getAssetFolders (filter: AssetFolderFilter) {
  const where: any[] = []
  const binds: any[] = []
  if (filter.ids?.length) {
    where.push(`id IN ${db.in(binds, filter.ids)}`)
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
  `)).map(r => new AssetFolder(r))
}
