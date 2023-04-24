import { DateTime } from 'luxon'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { DataFolder, type DataFolderFilter, Site, DeleteState, type VersionedService, processDeletedFilters } from '../internal.js'
import { isNotBlank, isNotNull } from 'txstate-utils'

function pathsToTuples (paths: string[]) {
  const sites = new Set<string | null>()
  const folders: { site: string | null, folder: string }[] = []

  for (const path of paths) {
    const parts = path.split('/').filter(isNotBlank)
    const siteName: string | undefined = parts[0]
    const folderName: string | undefined = parts[1]
    if (!siteName) return { siteTuples: [], folderTuples: [], dataTuples: [] }
    const resolvedSiteName = siteName === 'global' ? null : siteName
    if (!folderName) sites.add(resolvedSiteName)
    else {
      folders.push({ site: resolvedSiteName, folder: folderName })
    }
  }

  return { siteTuples: Array.from(sites), folderTuples: folders.map(f => [f.site, f.folder]) }
}

export async function getDataFolders (filter?: DataFolderFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'datafolders',
    new Map([]),
    ' AND sites.deletedAt IS NULL AND templates.deleted = 0',
    ' AND (sites.deletedAt IS NOT NULL OR templates.deleted = 1)'
  )

  if (filter != null) {
    if (filter.internalIds?.length) {
      where.push(`datafolders.id IN (${db.in(binds, filter.internalIds)})`)
    }
    if (filter.ids?.length) {
      where.push(`datafolders.guid IN (${db.in(binds, filter.ids)})`)
    }
    if (filter.templateIds?.length) {
      where.push(`datafolders.templateId IN (${db.in(binds, filter.templateIds)})`)
    }
    if (filter.templateKeys?.length) {
      where.push(`templates.\`key\` IN (${db.in(binds, filter.templateKeys)})`)
    }
    if (filter.siteIds?.length) {
      where.push(`datafolders.siteId IN (${db.in(binds, filter.siteIds)})`)
    }
    if (filter.global) {
      where.push('datafolders.siteId IS NULL')
    }
    if (filter.names?.length) {
      where.push(`datafolders.name IN (${db.in(binds, filter.names)})`)
    }
    if (filter.paths?.length) {
      const { folderTuples } = pathsToTuples(filter.paths)
      const ors: string[] = []
      for (const tuple of folderTuples) {
        binds.push(...tuple)
        ors.push('(sites.name <=> ? AND datafolders.name <=> ?)')
      }
      if (ors.length) where.push(ors.join(' OR '))
      else where.push('1=0')
    }
    if (filter.beneathOrAt?.length) {
      const { folderTuples, siteTuples } = pathsToTuples(filter.beneathOrAt)
      const ors: string[] = []
      if (siteTuples.filter(isNotNull).length) ors.push(`sites.name IN (${db.in(binds, siteTuples)})`)
      if (siteTuples.some(st => st == null)) ors.push('sites.name IS NULL')
      for (const tuple of folderTuples) {
        binds.push(...tuple)
        ors.push('(sites.name <=> ? AND datafolders.name <=> ?)')
      }
      if (ors.length) where.push(ors.join(' OR '))
    }
  }
  if (!where.length) {
    throw new Error('Must include a filter')
  }
  const folders = await db.getall(`
    SELECT datafolders.*, templates.key as templateKey,
      templates.deleted = 1 OR sites.deletedAt IS NOT NULL as orphaned
    FROM datafolders
    INNER JOIN templates ON datafolders.templateId = templates.id
    LEFT JOIN sites ON datafolders.siteId = sites.id
    ${Array.from(joins.values()).join('\n')}
    WHERE (${where.join(') AND (')})
  `, binds)
  return folders.map(f => new DataFolder(f))
}

export async function folderNameUniqueInDataRoot (name: string, templateId: string, siteId?: string): Promise<boolean> {
  const where: string[] = ['name = ? ', 'templateId = ? ']
  const binds: (string | number)[] = [name, templateId]
  if (siteId) {
    where.push('siteId = ?')
    binds.push(siteId)
  }
  const count = await db.getval(`SELECT COUNT(*) FROM datafolders WHERE ${where.join('AND ')}`, binds)
  return count === 0
}

export async function createDataFolder (name: string, templateId: string, siteId?: string) {
  const columns = ['name', 'guid', 'templateId']
  const binds = [name, nanoid(10), templateId]
  if (siteId) {
    columns.push('siteId')
    binds.push(siteId)
  }
  const newInternalId = await db.insert(`
    INSERT INTO datafolders (${columns.join(', ')})
    VALUES(${columns.map(c => '?').join(',')})`, binds)
  return new DataFolder(await db.getrow('SELECT * FROM datafolders WHERE id=?', [newInternalId]))
}

export async function renameDataFolder (folderId: string, name: string) {
  return await db.update('UPDATE datafolders SET name = ? WHERE guid = ?', [name, folderId])
}

export async function moveDataFolders (folderIds: string[], siteId?: string) {
  await db.transaction(async db => {
    const binds: string[] = []
    const dataFolders = (await db.getall(`SELECT * FROM datafolders WHERE guid IN (${db.in(binds, folderIds)})`, binds)).map((row) => new DataFolder(row))
    const site = siteId ? new Site(await db.getrow('SELECT * FROM sites WHERE id = ?', [siteId])) : undefined
    const moveBinds: (string | null)[] = []
    moveBinds.push(site ? site.id : null)
    await db.update(`UPDATE datafolders SET siteId = ? WHERE guid IN (${db.in(moveBinds, dataFolders.map(f => f.id))})`, moveBinds)
    const folderInternalIds = dataFolders.map(f => f.internalId)
    const dataInFolders = await db.getvals<number>(`SELECT id FROM data WHERE folderId IN (${db.in([], folderInternalIds)})`, folderInternalIds)
    if (dataInFolders.length) {
      await db.update(`UPDATE data SET siteId = ? WHERE id IN (${db.in([], dataInFolders)})`, [(site ? site.id : null), ...dataInFolders])
    }
  })
}

export async function deleteDataFolder (versionedService: VersionedService, folderIds: string[], userInternalId: number) {
  return await db.transaction(async db => {
    const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
    const dataEntryIds = await db.getvals<string>(`SELECT dataId from data INNER JOIN datafolders ON data.folderId = datafolders.id WHERE datafolders.guid IN (${db.in([], folderIds)})`, folderIds)
    if (dataEntryIds.length) {
      await versionedService.removeTags(dataEntryIds, ['published'], db)
      await db.update(`UPDATE data SET deletedBy = ?, deletedAt = NOW(), deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE dataId IN (${db.in([], dataEntryIds)})`, [userInternalId, DeleteState.MARKEDFORDELETE, ...dataEntryIds])
    }
    const binds: (string | number)[] = [userInternalId, DeleteState.MARKEDFORDELETE]
    return await db.update(`UPDATE datafolders SET deletedBy = ?, deletedAt = NOW(), deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE guid IN (${db.in(binds, folderIds)})`, binds)
  })
}

export async function finalizeDataFolderDeletion (guids: string[], userInternalId: number) {
  await db.transaction(async db => {
    const folderInternalIds = await db.getvals<number>(`SELECT id FROM datafolders WHERE guid IN (${db.in([], guids)})`, guids)
    const binds: number[] = [userInternalId, DeleteState.DELETED]
    await db.update(`UPDATE datafolders SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE id IN (${db.in(binds, folderInternalIds)})`, binds)
    await db.update(`UPDATE data SET deletedBy = ?, deletedAt = NOW(), deleteState = ? WHERE folderId IN (${db.in([], folderInternalIds)})`, binds)
  })
}

export async function undeleteDataFolders (guids: string[]) {
  await db.transaction(async db => {
    const folderInternalIds = await db.getvals<number>(`SELECT id FROM datafolders WHERE guid IN (${db.in([], guids)})`, guids)
    const binds: number[] = [DeleteState.NOTDELETED]
    await db.update(`UPDATE datafolders SET deletedBy = null, deletedAt = null, deleteState = ? WHERE id IN (${db.in(binds, folderInternalIds)})`, binds)
    await db.update(`UPDATE data SET deletedBy = null, deletedAt = null, deleteState = ? WHERE folderId IN (${db.in([], folderInternalIds)})`, binds)
  })
}
