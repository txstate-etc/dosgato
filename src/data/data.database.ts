import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { Queryable } from 'mysql2-async'
import { Data, DataFilter, VersionedService, CreateDataInput } from 'internal'

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
  query += ' ORDER BY folderId, displayOrder'
  const data = await db.getall(query, binds)
  return data.map(d => new Data(d))
}

// TODO: If data is not in a folder, does the displayOrder need to take into account the data template?
// Should the display order for global data be such that there's an item with displayOrder: 1 for each data template used?
// Or count from 1 to n, regardless of template?
async function handleDisplayOrder (db: Queryable, dataFolderInternalId?: string, siteId?: string) {
  let maxDisplayOrder
  if (dataFolderInternalId) {
    maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId = ?', [dataFolderInternalId])
  } else if (siteId) {
    maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId = ?', [siteId])
  } else {
    maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId IS NULL')
  }
  return (maxDisplayOrder ?? 0) + 1
}

export async function createDataEntry (versionedService: VersionedService, userId: string, args: CreateDataInput) {
  return await db.transaction(async db => {
    const dataFolderInternalId = args.folderId ? await db.getval<string>('SELECT id FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const displayOrder = await handleDisplayOrder(db, dataFolderInternalId, args.siteId)
    const data = Object.assign({}, args.data, { templateKey: args.templateKey, savedAtVersion: args.schemaVersion })
    const indexes = [{ name: 'template', values: [args.templateKey] }]
    // TODO: What other indexes are needed?
    // Data objects could have links or images. Would the rendering component index the data entry?
    const dataId = await versionedService.create('data', data, indexes, userId, db)
    const columns = ['dataId', 'name', 'displayOrder']
    const binds = [dataId, args.name, displayOrder]
    if (args.siteId) {
      columns.push('siteId')
      binds.push(args.siteId)
    }
    if (dataFolderInternalId) {
      columns.push('folderId')
      binds.push(dataFolderInternalId)
    }
    const newInternalId = await db.insert(`
    INSERT INTO data (${columns.join(', ')})
      VALUES (${columns.map(c => '?').join(', ')})`, binds)
    return new Data(await db.getrow('SELECT * FROM data WHERE id=?', [newInternalId]))
  })
}
