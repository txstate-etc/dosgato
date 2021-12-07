import db from 'mysql2-async/db'
import { AssetFolder } from '.'
import { AssetFolderFilter } from './assetfolder.model'

export async function getAssetFolders (filter: AssetFolderFilter) {
  const where: any[] = []
  const binds: any[] = []
  if (filter.ids?.length) {
    where.push(`id IN ${db.in(binds, filter.ids)}`)
  }
  return (await db.getall(`
    SELECT *
    FROM assetfolders
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
  `)).map(r => new AssetFolder(r))
}
