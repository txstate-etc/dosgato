import db from 'mysql2-async/db'
import { isNotNull, unique, sortby } from 'txstate-utils'
import { Queryable } from 'mysql2-async'
import { formatSavedAtVersion, Data, DataFilter, VersionedService, CreateDataInput, DataServiceInternal, getDataIndexes, DataFolder, Site, MoveDataTarget } from '../internal.js'

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
  if (isNotNull(filter?.root)) {
    if (filter?.root) {
      where.push('data.folderId IS NULL')
    } else {
      where.push('data.folderId IS NOT NULL')
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

async function getEntriesWithTemplate (db: Queryable, versionedService: VersionedService, templateKey: string) {
  const searchRule = { indexName: 'template', equal: templateKey }
  // TODO: These are not fetched in a transaction. Do we need to add the transaction as an optional parameter for find()?
  const [dataIdsLatest, dataIdsPublished] = await Promise.all([
    versionedService.find([searchRule], 'latest'),
    versionedService.find([searchRule], 'published')])
  const dataIds = unique([...dataIdsLatest, ...dataIdsPublished])
  if (!dataIds.length) return []
  const binds: string[] = []
  const rows = await db.getall(`SELECT * FROM data WHERE dataId IN (${db.in(binds, dataIds)})`, binds)
  return rows.map(r => new Data(r))
}

async function handleDisplayOrder (db: Queryable, versionedService: VersionedService, templateKey: string, entriesAdded: number, folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
  if (aboveTarget) {
    const displayOrder = aboveTarget.displayOrder
    if (aboveTarget.folderInternalId) {
      await db.update(`UPDATE data SET displayOrder = displayOrder + ${entriesAdded} WHERE folderId = ? AND displayOrder >= ?`, [aboveTarget.folderInternalId, displayOrder])
    } else {
      const entriesWithTemplate = await getEntriesWithTemplate(db, versionedService, templateKey)
      const binds: (string | number)[] = []
      binds.push(displayOrder)
      if (aboveTarget.siteId) {
        binds.push(aboveTarget.siteId)
        await db.update(`
          UPDATE data SET displayOrder = displayOrder + ${entriesAdded}
          WHERE folderId IS NULL AND
          displayOrder >= ? AND
          siteId = ? AND
          id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      } else {
        await db.update(`
          UPDATE data SET displayOrder = displayOrder + ${entriesAdded}
          WHERE folderId is NULL AND
          siteId IS NULL AND
          displayOrder >= ? AND
          id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      }
    }
    return displayOrder
  } else {
    let maxDisplayOrder
    if (folderInternalId) {
      maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId = ?', [folderInternalId])
    } else {
      const entriesWithTemplate = await getEntriesWithTemplate(db, versionedService, templateKey)
      const binds: string[] = []
      if (siteId) {
        binds.push(siteId)
        maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId = ? ${entriesWithTemplate.length ? `AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})` : ''}`, binds)
      } else {
        maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId IS NULL ${entriesWithTemplate.length ? `AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})` : ''}`, binds)
      }
    }
    return (maxDisplayOrder ?? 0) + 1
  }
}

async function updateSourceDisplayOrder (db: Queryable, versionedService: VersionedService, data: Data, templateKey: string, movingIds: number[], folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
  if (data.folderInternalId) {
    if (aboveTarget) {
      if (data.folderInternalId !== aboveTarget.folderInternalId) {
        // data moved out of folder
        const binds: number[] = [data.folderInternalId]
        const remaining = await db.getvals<number>(`
          SELECT id FROM data
          WHERE data.folderId = ? AND id NOT IN (${db.in(binds, movingIds)})
          ORDER BY displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    } else {
      if (!folderInternalId || folderInternalId !== data.folderInternalId) {
        // data moved out of folder
        const binds: number[] = [data.folderInternalId]
        const remaining = await db.getvals<number>(`
          SELECT id FROM data
          WHERE data.folderId = ? AND id NOT IN (${db.in(binds, movingIds)})
          ORDER BY displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    }
  } else {
    // data was not in a folder
    const entriesWithTemplate = await getEntriesWithTemplate(db, versionedService, templateKey)
    const remainingEntriesWithTemplate = entriesWithTemplate.filter((entry) => !movingIds.includes(entry.internalId))
    // was it in a site?
    if (data.siteId) {
      if ((aboveTarget && data.siteId !== aboveTarget.siteId) || (!aboveTarget && data.siteId !== siteId)) {
        const binds: (number|string)[] = [data.siteId]
        const remaining = await db.getvals<number>(`
          SELECT id from data
          WHERE siteId = ? AND folderId IS NULL AND id IN (${db.in(binds, remainingEntriesWithTemplate.map((e) => e.internalId))})
          ORDER BY displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    } else {
      // global data moved to a site or folder
      if (aboveTarget?.siteId || aboveTarget?.folderInternalId || folderInternalId || siteId) {
        const binds: (number|string)[] = []
        const remaining = await db.getvals<number>(`
          SELECT id from data
          WHERE siteId IS NULL AND folderId IS NULL AND id IN (${db.in(binds, remainingEntriesWithTemplate.map((e) => e.internalId))})
          ORDER BY displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    }
  }
}

export async function createDataEntry (versionedService: VersionedService, userId: string, args: CreateDataInput) {
  return await db.transaction(async db => {
    const dataFolderInternalId = args.folderId ? await db.getval<number>('SELECT id FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const displayOrder = await handleDisplayOrder(db, versionedService, args.templateKey, 1, dataFolderInternalId, args.siteId)
    const data = Object.assign({}, args.data, { templateKey: args.templateKey, savedAtVersion: formatSavedAtVersion(args.schemaVersion) })
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

export async function renameDataEntry (dataId: string, name: string) {
  return await db.update('UPDATE data SET name = ? WHERE dataId = ?', [name, dataId])
}

export async function moveDataEntries (versionedService: VersionedService, dataIds: string[], templateKey: string, target: MoveDataTarget) {
  return await db.transaction(async db => {
    const binds: string[] = []
    let dataEntries = (await db.getall(`SELECT * FROM data WHERE dataId IN (${db.in(binds, dataIds)})`, binds)).map((row) => new Data(row))
    dataEntries = sortby(dataEntries, 'displayOrder')
    const folder = target.folderId ? new DataFolder(await db.getrow('SELECT * FROM datafolders WHERE guid = ?', [target.folderId])) : undefined
    const site = target.siteId ? new Site(await db.getrow('SELECT * FROM sites WHERE id = ?', [target.siteId])) : undefined
    const aboveTarget = target.aboveTarget ? new Data(await db.getrow('SELECT * from data WHERE dataId = ?', [target.aboveTarget])) : undefined
    // get the entrys' new display order
    const displayOrder = await handleDisplayOrder(db, versionedService, templateKey, dataEntries.length, folder?.internalId, site?.id, aboveTarget)
    // update the display order for data in the entrys' previous locations
    for (const d of dataEntries) {
      await updateSourceDisplayOrder(db, versionedService, d, templateKey, dataEntries.map(e => e.internalId), folder?.internalId, site?.id, aboveTarget)
    }
    if (aboveTarget) {
      // if the entry is being moved above a specific data entry, use the same site and folder values as that specific data entry
      return await Promise.all(dataEntries.map(async (data, index) => {
        const binds: (string | number | null)[] = [displayOrder + index]
        binds.push((aboveTarget.folderInternalId ?? null))
        binds.push((aboveTarget.siteId ?? null))
        binds.push(data.internalId)
        await db.update('UPDATE data SET displayOrder = ?, folderId = ?, siteId = ? WHERE id = ?', binds)
      }))
    }
    if (folder) {
      // data is in a folder that may or may not be in a site
      return await Promise.all(dataEntries.map(async (data, index) => {
        const updates = ['displayOrder = ?', 'folderId = ?']
        const binds: (string | number)[] = [displayOrder + index, folder.internalId]
        if (folder.siteId) {
          updates.push('siteId = ?')
          binds.push(folder.siteId)
        }
        binds.push(data.internalId)
        return await db.update(`UPDATE data SET ${updates.join(', ')} WHERE id = ?`, binds)
      }))
    }
    if (site) {
      return await Promise.all(dataEntries.map(async (data, index) => {
        return await db.update('UPDATE data SET displayOrder = ?, folderId = NULL, siteId = ? WHERE id = ?', [displayOrder + index, site.id, data.internalId])
      }))
    }
    // global data that is not in a folder
    return await Promise.all(dataEntries.map(async (data, index) => {
      return await db.update('UPDATE data SET displayOrder = ?, folderId = NULL, siteId = NULL WHERE id = ?', [displayOrder + index, data.internalId])
    }))
  })
}

export async function deleteDataEntries (dataIds: string[], userInternalId: number) {
  const binds: (string|number)[] = [userInternalId]
  return await db.update(`UPDATE data SET deletedAt = NOW(), deletedBy = ? WHERE dataId IN (${db.in(binds, dataIds)})`, binds)
}

export async function undeleteDataEntries (dataIds: string[]) {
  const binds: string[] = []
  return await db.update(`UPDATE data SET deletedAt = NULL, deletedBy = NULL where dataId IN (${db.in(binds, dataIds)})`, binds)
}
