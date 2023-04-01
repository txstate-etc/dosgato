import db from 'mysql2-async/db'
import { isNotNull, unique, sortby } from 'txstate-utils'
import { type Queryable } from 'mysql2-async'
import { Data, type DataFilter, type VersionedService, type CreateDataInput, getDataIndexes, DataFolder, Site, type MoveDataTarget, DeleteState, processDeletedFilters } from '../internal.js'
import { DateTime } from 'luxon'

async function processFilters (filter?: DataFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'data',
    new Map([
      ['templates', 'INNER JOIN templates ON data.templateId = templates.id'],
      ['sites', 'LEFT JOIN sites ON data.siteId = sites.id']
    ]),
    ' AND sites.deletedAt IS NULL AND templates.deleted = 0',
    ' AND (sites.deletedAt IS NOT NULL OR templates.deleted = 1)'
  )

  if (filter == null) return { where, binds, joins }

  if (filter.templateKeys?.length) {
    joins.set('templates', 'INNER JOIN templates ON templates.id=data.templateId')
    where.push(`templates.\`key\` IN (${db.in(binds, filter.templateKeys)})`)
  }

  if (filter.internalIds?.length) {
    where.push(`data.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter.ids?.length) {
    where.push(`data.dataId IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.names?.length) {
    where.push(`data.name IN (${db.in(binds, filter.names)})`)
  }
  if (isNotNull(filter.global)) {
    if (filter.global) {
      where.push('data.siteId IS NULL')
    } else {
      where.push('data.siteId IS NOT NULL')
    }
  }
  if (isNotNull(filter.root)) {
    if (filter.root) {
      where.push('data.folderId IS NULL')
    } else {
      where.push('data.folderId IS NOT NULL')
    }
  }
  if (filter.folderIds?.length) {
    joins.set('datafolders', 'INNER JOIN datafolders on data.folderId = datafolders.id')
    where.push(`datafolders.guid IN (${db.in(binds, filter.folderIds)})`)
  }
  if (filter.folderInternalIds?.length) {
    where.push(`data.folderId IN (${(db.in(binds, filter.folderInternalIds))})`)
  }
  if (filter.siteIds?.length) {
    where.push(`data.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  return { where, binds, joins }
}

export async function getData (filter?: DataFilter) {
  const { where, binds, joins } = await processFilters(filter)
  let query = 'SELECT data.* FROM data'
  query += ` ${Array.from(joins.values()).join('\n')}`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  query += ' ORDER BY folderId, displayOrder'
  const data = await db.getall(query, binds)
  return data.map(d => new Data(d))
}

async function getEntriesWithTemplate (db: Queryable, versionedService: VersionedService, templateKey: string) {
  const searchRule = { indexName: 'templateKey', equal: templateKey }
  const [dataIdsLatest, dataIdsPublished] = await Promise.all([
    versionedService.find([searchRule], 'data', undefined, undefined, db),
    versionedService.find([searchRule], 'data', 'published', undefined, db)])
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
        const binds: (number | string)[] = [data.siteId]
        const remaining = await db.getvals<number>(`
          SELECT id from data
          WHERE siteId = ? AND folderId IS NULL AND id IN (${db.in(binds, remainingEntriesWithTemplate.map((e) => e.internalId))})
          ORDER BY displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    } else {
      // global data moved to a site or folder
      if (aboveTarget?.siteId || aboveTarget?.folderInternalId || folderInternalId || siteId) {
        const binds: (number | string)[] = []
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
  const newInternalId = await db.transaction(async db => {
    const folder = args.folderId ? await db.getrow<{ id: number, siteId: number }>('SELECT id, siteId FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const siteId = folder?.siteId ?? args.siteId
    const displayOrder = await handleDisplayOrder(db, versionedService, args.data.templateKey, 1, folder?.id, args.siteId)
    const data = args.data
    const templateId = await db.getval<number>('SELECT id FROM templates WHERE `key`=?', [data.templateKey])
    if (!templateId) throw new Error('templateKey does not exist.')
    const indexes = getDataIndexes(data)
    const dataId = await versionedService.create('data', data, indexes, userId, db)
    const columns = ['templateId', 'dataId', 'name', 'displayOrder']
    const binds = [templateId, dataId, args.name, displayOrder]
    if (siteId) {
      columns.push('siteId')
      binds.push(siteId)
    }
    if (folder?.id) {
      columns.push('folderId')
      binds.push(folder?.id)
    }
    return await db.insert(`
    INSERT INTO data (${columns.join(', ')})
      VALUES (${columns.map(c => '?').join(', ')})`, binds)
  })
  return new Data(await db.getrow('SELECT * FROM data WHERE id=?', [newInternalId]))
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

export async function deleteDataEntries (versionedService: VersionedService, data: Data[], userInternalId: number) {
  const binds: (string | number)[] = [userInternalId, DeleteState.MARKEDFORDELETE]
  const dataIds = data.map(d => d.dataId)
  return await db.transaction(async db => {
    await versionedService.removeTags(dataIds, ['published'], db)
    return await db.update(`UPDATE data SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE dataId IN (${db.in(binds, dataIds)})`, binds)
  })
}

export async function publishDataEntryDeletions (data: Data[], userInternalId: number) {
  const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
  const binds: (string | number)[] = [userInternalId, DeleteState.DELETED]
  return await db.update(`UPDATE data SET deletedAt = NOW(), deletedBy = ?, deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE dataId IN (${db.in(binds, data.map(d => d.dataId))})`, binds)
}

export async function undeleteDataEntries (data: Data[]) {
  const binds: (string | number)[] = [DeleteState.NOTDELETED]
  const dataIds = data.map(d => d.dataId)
  return await db.update(`UPDATE data SET deletedAt = NULL, deletedBy = NULL, deleteState = ? where dataId IN (${db.in(binds, dataIds)})`, binds)
}
