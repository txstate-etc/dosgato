import db from 'mysql2-async/db'
import { Asset, AssetFilter } from './asset.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter?: AssetFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins: string[] = []

  if (typeof filter !== 'undefined') {
    if (filter.internalIds?.length) {
      where.push(`assets.id IN (${db.in(binds, filter.internalIds)})`)
    }
    if (filter.ids?.length) {
      where.push(`assets.dataId IN (${db.in(binds, filter.ids)})`)
    }
    if (filter.folderIds?.length) {
      where.push(`assetfolders.guid IN (${db.in(binds, filter.folderIds)})`)
      joins.push('INNER JOIN assetfolders ON assets.folderId = assetfolders.id')
    }
    if (filter.folderInternalIds?.length) {
      where.push(`assets.folderId IN (${db.in(binds, filter.folderInternalIds)})`)
    }
    if (isNotNull(filter.referenced)) {
      // TODO
    }
    if (isNotNull(filter.deleted)) {
      if (filter.deleted) {
        where.push('assets.deletedAt IS NOT NULL')
      } else {
        where.push('assets.deletedAt IS NULL')
      }
    }
  }
  return { binds, where, joins }
}

export async function getAssets (filter?: AssetFilter) {
  const { binds, where, joins } = processFilters(filter)
  const assets = await db.getall(`SELECT assets.* FROM assets
  ${joins.join('\n')}
  WHERE (${where.join(') AND (')})`, binds)
  return assets.map(a => new Asset(a))
}