import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { Data, DataFilter } from './data.model'

function processFilters (filter?: DataFilter) {
  const where: string[] = []
  const binds: string[] = []
  const joins: string[] = []
  const joined = new Map<string, boolean>()

  if (filter?.internalIds?.length) {
    where.push(`data.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter?.ids?.length) {
    where.push(`data.dataId IN (${db.in(binds, filter.ids)})`)
  }
  if (isNotNull(filter?.global)) {
    if (filter?.global) {
      where.push('data.siteId IS NULL')
    } else {
      where.push('data.siteId IS NOT NULL')
    }
  }
  if (filter?.folderIds?.length) {
    where.push(`datafolders.guid IN (${db.in(binds, filter.folderIds)})`)
    if (!joined.has('datafolders')) {
      joins.push('INNER JOIN datafolders on data.folderId = datafolders.id')
      joined.set('datafolders', true)
    }
  }
  if (filter?.folderInternalIds?.length) {
    where.push(`data.folderId IN (${(db.in(binds, filter.folderInternalIds))})`)
  }
  if (filter?.siteIds?.length) {
    where.push(`data.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter?.templateKeys?.length) {
    // TODO: look this up using VersionedService?
  }
  if (isNotNull(filter?.deleted)) {
    if (filter?.deleted) {
      where.push('data.deletedAt IS NOT NULL')
    } else {
      where.push('data.deletedAt IS NULL')
    }
  }
  return { where, binds, joins }
}

export async function getData (filter?: DataFilter) {
  const { where, binds, joins } = processFilters(filter)
  let query = 'SELECT data.* FROM data'
  if (joins.length) {
    query += ` ${joins.join('\n')}`
  }
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  const data = await db.getall(query, binds)
  return data.map(d => new Data(d))
}
