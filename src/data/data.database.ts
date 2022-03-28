import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { Queryable } from 'mysql2-async'
import { Data, DataFilter, VersionedService, CreateDataInput, DataServiceInternal, getDataIndexes } from 'internal'

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

async function handleDisplayOrder (db: Queryable, versionedService: VersionedService, dataServiceInternal: DataServiceInternal, templateKey: string, dataFolderInternalId?: string, siteId?: string) {
  let maxDisplayOrder
  if (dataFolderInternalId) {
    maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId = ?', [dataFolderInternalId])
  } else {
    const entriesWithTemplate = await dataServiceInternal.findByTemplate(templateKey)
    const binds: string[] = []
    if (siteId) {
      // site level data, not in a folder
      binds.push(siteId)
      console.log(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId = ? AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`)
      maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId = ? AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
    } else {
      // global data, not in a folder
      maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId IS NULL AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
    }
  }
  return (maxDisplayOrder ?? 0) + 1
}

export async function createDataEntry (versionedService: VersionedService, dataServiceInternal: DataServiceInternal, userId: string, args: CreateDataInput) {
  return await db.transaction(async db => {
    const dataFolderInternalId = args.folderId ? await db.getval<string>('SELECT id FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const displayOrder = await handleDisplayOrder(db, versionedService, dataServiceInternal, args.templateKey, dataFolderInternalId, args.siteId)
    // TODO: Assuming the template key and schema version are passed in as separate arguments, but maybe they are already in the data?
    const data = Object.assign({}, args.data, { templateKey: args.templateKey, savedAtVersion: args.schemaVersion })
    const indexes = await getDataIndexes(data)
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
