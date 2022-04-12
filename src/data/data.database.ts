import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { Queryable } from 'mysql2-async'
import { formatSavedAtVersion } from '../util'
import { Data, DataFilter, VersionedService, CreateDataInput, DataServiceInternal, getDataIndexes, DataFolder, Site } from 'internal'

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

async function handleDisplayOrder (db: Queryable, dataServiceInternal: DataServiceInternal, templateKey: string, folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
  if (aboveTarget) {
    const displayOrder = aboveTarget.displayOrder
    if (aboveTarget.folderInternalId) {
      await db.update('UPDATE data SET displayOrder = displayOrder + 1 WHERE folderId = ? AND displayOrder >= ?', [aboveTarget.folderInternalId, displayOrder])
    } else {
      const entriesWithTemplate = await dataServiceInternal.findByTemplate(templateKey)
      const binds: (string | number)[] = []
      binds.push(displayOrder)
      if (aboveTarget.siteId) {
        binds.push(aboveTarget.siteId)
        await db.update(`
          UPDATE data SET displayOrder = displayOrder + 1
          WHERE folderId IS NULL AND
          displayOrder >= ? AND
          siteId = ? AND
          id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      } else {
        await db.update(`
          UPDATE data SET displayOrder = displayOrder + 1
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
      const entriesWithTemplate = await dataServiceInternal.findByTemplate(templateKey)
      const binds: string[] = []
      if (siteId) {
        binds.push(siteId)
        maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId = ? AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      } else {
        maxDisplayOrder = await db.getval<number>(`SELECT MAX(displayOrder) FROM data WHERE folderId IS NULL AND siteId IS NULL AND id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      }
    }
    return (maxDisplayOrder ?? 0) + 1
  }
}

async function updateSourceDisplayOrder (db: Queryable, dataServiceInternal: DataServiceInternal, data: Data, templateKey: string, folderInternalId?: number, siteId?: string, aboveTarget?: Data) {
  if (data.folderInternalId) {
    if ((aboveTarget && data.folderInternalId !== aboveTarget.folderInternalId) || data.folderInternalId !== folderInternalId) {
      // data moved out of folder. Update display order for items in source folder with display order > data.displayOrder
      await db.update('UPDATE data SET displayOrder = displayOrder - 1 WHERE folderId = ? AND displayOrder > ?', [data.folderInternalId, data.displayOrder])
    }
  } else {
    // data was not in a folder
    const entriesWithTemplate = await dataServiceInternal.findByTemplate(templateKey)
    const binds: (string|number)[] = []
    binds.push(data.displayOrder)
    // was it in a site?
    if (data.siteId) {
      if ((aboveTarget && data.siteId !== aboveTarget.siteId) || data.siteId !== siteId) {
        // data moved out of site
        binds.push(data.siteId)
        await db.update(`
          UPDATE data SET displayOrder = displayOrder - 1
          WHERE folderId IS NULL AND
          displayOrder > ? AND
          siteId = ? AND
          id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
      }
    } else {
      // global data moved to a site or folder
      // update display order for global data withe the same template as the data that moved and displayORder > data.displayOrder
      await db.update(`
        UPDATE data SET displayOrder = displayOrder - 1
        WHERE folderId IS NULL AND
        siteId IS NULL AND
        displayOrder > ? AND
        id IN (${db.in(binds, entriesWithTemplate.map(d => d.internalId))})`, binds)
    }
  }
}

export async function createDataEntry (versionedService: VersionedService, dataServiceInternal: DataServiceInternal, userId: string, args: CreateDataInput) {
  return await db.transaction(async db => {
    const dataFolderInternalId = args.folderId ? await db.getval<number>('SELECT id FROM datafolders WHERE guid = ?', [args.folderId]) : undefined
    const displayOrder = await handleDisplayOrder(db, dataServiceInternal, args.templateKey, dataFolderInternalId, args.siteId)
    // TODO: Assuming the template key and schema version are passed in as separate arguments, but maybe they are already in the data?
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

export async function moveDataEntry (dataServiceInternal: DataServiceInternal, data: Data, templateKey: string, userId: string, folder: DataFolder|undefined, site: Site|undefined, aboveTarget?: Data) {
  return await db.transaction(async db => {
    // get the entry's new display order
    const displayOrder = await handleDisplayOrder(db, dataServiceInternal, templateKey, folder?.internalId, site?.id, aboveTarget)
    // update the display order for data in the entry's previous location
    await updateSourceDisplayOrder(db, dataServiceInternal, data, templateKey, folder?.internalId, site?.id, aboveTarget)
    if (aboveTarget) {
      // if the entry is being moved above a specific data entry, use the same site and folder values as that specific data entry
      const binds: (string | number | null)[] = [displayOrder]
      binds.push((aboveTarget.folderInternalId ?? null))
      binds.push((aboveTarget.siteId ?? null))
      binds.push(data.internalId)
      return await db.update('UPDATE data SET displayOrder = ?, folderId = ?, siteId = ? WHERE id = ?', binds)
    }
    if (folder) {
      // data is in a folder that may or may not be in a site
      const updates = ['displayOrder = ?', 'folderId = ?']
      const binds: (string | number)[] = [displayOrder, folder.internalId]
      if (folder.siteId) {
        updates.push('siteId = ?')
        binds.push(folder.siteId)
      }
      binds.push(data.internalId)
      return await db.update(`UPDATE data SET ${updates.join(', ')} WHERE id = ?`, binds)
    }
    if (site) {
      // site-level data
      return await db.update('UPDATE data SET displayOrder = ?, folderId = NULL, siteId = ? WHERE id = ?', [displayOrder, site.id, data.internalId])
    }
    // global data that is not in a folder
    return await db.update('UPDATE data SET displayOrder = ?, folderId = NULL, siteId = NULL WHERE id = ?', [displayOrder, data.internalId])
  })
}

export async function deleteDataEntry (dataId: string, userInternalId: number) {
  return await db.update('UPDATE data SET deletedAt = NOW(), deletedBy = ? WHERE dataId = ?', [userInternalId, dataId])
}

export async function undeleteDataEntry (dataId: string) {
  return await db.update('UPDATE data SET deletedAt = NULL, deletedBy = NULL where dataId = ?', [dataId])
}
