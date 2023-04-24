import db from 'mysql2-async/db'
import { isNotBlank, isNotNull, sortby } from 'txstate-utils'
import { type Queryable } from 'mysql2-async'
import { Data, type DataFilter, type VersionedService, type CreateDataInput, getDataIndexes, DataFolder, Site, type MoveDataTarget, DeleteState, processDeletedFilters } from '../internal.js'
import { DateTime } from 'luxon'

function pathsToTuples (paths: string[]) {
  const sites = new Set<string | null>()
  const folders: { site: string | null, folder: string }[] = []
  const data: { site: string | null, folder: string | null, data: string }[] = []

  for (const path of paths) {
    const parts = path.split('/').filter(isNotBlank)
    const siteName: string | undefined = parts[0]
    const folderOrDataName: string | undefined = parts[1]
    const dataName: string | undefined = parts[2]
    if (!siteName) return { siteTuples: [], folderTuples: [], dataTuples: [] }
    const resolvedSiteName = siteName === 'global' ? null : siteName
    if (!folderOrDataName) sites.add(resolvedSiteName)
    else if (!dataName) {
      folders.push({ site: resolvedSiteName, folder: folderOrDataName })
      data.push({ site: resolvedSiteName, folder: null, data: folderOrDataName })
    } else data.push({ site: resolvedSiteName, folder: folderOrDataName, data: dataName })
  }

  return { siteTuples: Array.from(sites), folderTuples: folders.map(f => [f.site, f.folder]), dataTuples: data.map(d => [d.site, d.folder, d.data]) }
}

async function processFilters (filter?: DataFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'data',
    new Map([]),
    ' AND sites.deletedAt IS NULL AND templates.deleted = 0',
    ' AND (sites.deletedAt IS NOT NULL OR templates.deleted = 1)'
  )

  if (filter == null) return { where, binds, joins }

  if (filter.templateKeys?.length) {
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
    joins.set('datafolders', 'LEFT JOIN datafolders on data.folderId = datafolders.id')
    where.push(`datafolders.guid IN (${db.in(binds, filter.folderIds)})`)
  }
  if (filter.folderInternalIds?.length) {
    where.push(`data.folderId IN (${(db.in(binds, filter.folderInternalIds))})`)
  }
  if (filter.siteIds?.length) {
    where.push(`data.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter.paths?.length) {
    const { dataTuples } = pathsToTuples(filter.paths)
    joins.set('datafolders', 'LEFT JOIN datafolders on data.folderId = datafolders.id')
    const ors: string[] = []
    for (const tuple of dataTuples) {
      binds.push(...tuple)
      ors.push('(sites.name <=> ? AND datafolders.name <=> ? AND data.name <=> ?)')
    }
    if (ors.length) where.push(ors.join(' OR '))
    else where.push('1=0')
  }
  if (filter.beneathOrAt?.length) {
    const { dataTuples, folderTuples, siteTuples } = pathsToTuples(filter.beneathOrAt)
    joins.set('datafolders', 'LEFT JOIN datafolders on data.folderId = datafolders.id')
    const ors: string[] = []
    if (siteTuples.filter(isNotNull).length) ors.push(`sites.name IN (${db.in(binds, siteTuples)})`)
    if (siteTuples.some(st => st == null)) ors.push('sites.name IS NULL')
    for (const tuple of folderTuples) {
      binds.push(...tuple)
      ors.push('(sites.name <=> ? AND datafolders.name <=> ?)')
    }
    for (const tuple of dataTuples) {
      binds.push(...tuple)
      ors.push('(sites.name <=> ? AND datafolders.name <=> ? AND data.name <=> ?)')
    }
    if (ors.length) where.push(ors.join(' OR '))
  }
  return { where, binds, joins }
}

export async function getData (filter?: DataFilter) {
  const { where, binds, joins } = await processFilters(filter)
  let query = `SELECT data.*, templates.key AS templateKey,
    templates.deleted = 1 OR sites.deletedAt IS NOT NULL as orphaned
  FROM data
  INNER JOIN templates ON data.templateId = templates.id
  LEFT JOIN sites ON data.siteId = sites.id`
  query += ` ${Array.from(joins.values()).join('\n')}`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  query += ' ORDER BY folderId, displayOrder'
  const data = await db.getall(query, binds)
  return data.map(d => new Data(d))
}

async function handleDisplayOrder (db: Queryable, templateKey: string, entriesAdded: number, folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
  if (aboveTarget) {
    const displayOrder = aboveTarget.displayOrder
    if (aboveTarget.folderInternalId) {
      await db.update(`UPDATE data SET displayOrder = displayOrder + ${entriesAdded} WHERE folderId = ? AND displayOrder >= ?`, [aboveTarget.folderInternalId, displayOrder])
    } else if (aboveTarget.siteId) {
      await db.update(`
        UPDATE data d
        INNER JOIN templates t ON d.templateId = t.id
        SET d.displayOrder = d.displayOrder + ${entriesAdded}
        WHERE d.folderId IS NULL AND
        d.displayOrder >= ? AND
        d.siteId = ? AND
        t.key = ?`, [displayOrder, aboveTarget.siteId, templateKey])
    } else {
      await db.update(`
        UPDATE data d
        INNER JOIN templates t ON d.templateId = t.id
        SET d.displayOrder = d.displayOrder + ${entriesAdded}
        WHERE d.folderId is NULL AND
        d.siteId IS NULL AND
        d.displayOrder >= ? AND
        t.key = ?`, [displayOrder, templateKey])
    }
    return displayOrder
  } else {
    let maxDisplayOrder
    if (folderInternalId) {
      maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM data WHERE folderId = ?', [folderInternalId])
    } else if (siteId) {
      maxDisplayOrder = await db.getval<number>('SELECT MAX(d.displayOrder) FROM data d INNER JOIN templates t ON d.templateId = t.id WHERE d.folderId IS NULL AND d.siteId = ? AND t.key = ?', [siteId, templateKey])
    } else {
      maxDisplayOrder = await db.getval<number>('SELECT MAX(d.displayOrder) FROM data d INNER JOIN templates t ON d.templateId = t.id WHERE d.folderId IS NULL AND d.siteId IS NULL AND t.key = ?', [templateKey])
    }
    return (maxDisplayOrder ?? 0) + 1
  }
}

async function updateSourceDisplayOrder (db: Queryable, data: Data, templateKey: string, movingIds: number[], folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
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
    // was it in a site?
    if (data.siteId) {
      if ((aboveTarget && data.siteId !== aboveTarget.siteId) || (!aboveTarget && data.siteId !== siteId)) {
        const binds: (number | string)[] = [data.siteId, templateKey]
        const remaining = await db.getvals<number>(`
          SELECT d.id FROM data d
          INNER JOIN templates t ON t.id=d.templateId
          WHERE d.siteId = ? AND t.key = ?
            AND d.folderId IS NULL AND d.id NOT IN (${db.in(binds, movingIds)})
          ORDER BY d.displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    } else {
      // global data moved to a site or folder
      if (aboveTarget?.siteId || aboveTarget?.folderInternalId || folderInternalId || siteId) {
        const binds: (number | string)[] = [templateKey]
        const remaining = await db.getvals<number>(`
          SELECT d.id from data d
          INNER JOIN templates t ON t.id=d.templateId
          WHERE d.siteId IS NULL AND t.key = ?
          AND d.folderId IS NULL AND d.id NOT IN (${db.in(binds, movingIds)})
          ORDER BY d.displayOrder`, binds)
        await Promise.all(remaining.map(async (id, index) => await db.update('UPDATE data SET displayOrder = ? WHERE id = ?', [index + 1, id])))
      }
    }
  }
}

export async function createDataEntry (versionedService: VersionedService, userId: string, args: CreateDataInput) {
  const newInternalId = await db.transaction(async db => {
    const folder = args.folderId ? await db.getrow<{ id: number, siteId: number }>('SELECT id, siteId FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const siteId = folder?.siteId ?? args.siteId
    const displayOrder = await handleDisplayOrder(db, args.data.templateKey, 1, folder?.id, args.siteId)
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
  return (await getData({ internalIds: [newInternalId] }))[0]
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
    const displayOrder = await handleDisplayOrder(db, templateKey, dataEntries.length, folder?.internalId, site?.id, aboveTarget)
    // update the display order for data in the entrys' previous locations
    for (const d of dataEntries) {
      await updateSourceDisplayOrder(db, d, templateKey, dataEntries.map(e => e.internalId), folder?.internalId, site?.id, aboveTarget)
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
