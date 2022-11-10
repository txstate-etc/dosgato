import db from 'mysql2-async/db'
import { eachConcurrent, isNotNull } from 'txstate-utils'
import { nanoid } from 'nanoid'
import { DataFolder, DataFolderFilter, Site, DeletedFilter, DeleteState, VersionedService } from '../internal.js'
import { DateTime } from 'luxon'

export async function getDataFolders (filter?: DataFolderFilter) {
  const where: string[] = []
  const binds: string[] = []

  if (filter?.internalIds?.length) {
    where.push(`datafolders.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter?.ids?.length) {
    where.push(`datafolders.guid IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.templateIds?.length) {
    where.push(`datafolders.templateId IN (${db.in(binds, filter.templateIds)})`)
  }
  if (filter?.siteIds?.length) {
    where.push(`datafolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter?.global) {
    where.push('datafolders.siteId IS NULL')
  }
  if (filter?.deleted) {
    if (filter.deleted === DeletedFilter.ONLY) {
      where.push('datafolders.deletedAt IS NOT NULL')
    } else if (filter.deleted === DeletedFilter.HIDE) {
      where.push('datafolders.deletedAt IS NULL')
    }
  } else {
    where.push('datafolders.deletedAt IS NULL')
  }
  if (!where.length) {
    throw new Error('Must include a filter')
  }
  const folders = await db.getall(`SELECT * FROM datafolders WHERE (${where.join(') AND (')})`, binds)
  return folders.map(f => new DataFolder(f))
}

export async function folderNameUniqueInDataRoot (name: string, siteId?: string): Promise<boolean> {
  const where: string[] = ['name = ?']
  const binds: string[] = [name]
  if (siteId) {
    where.push('siteId = ?')
    binds.push(siteId)
  }
  const count = await db.getval(`SELECT COUNT(*) FROM datafolders WHERE ${where.join('AND ')}`, binds)
  return count === 0
}

export async function createDataFolder (name: string, templateInternalId: number, siteId?: string) {
  const columns = ['name', 'guid', 'templateId']
  const binds = [name, nanoid(10), templateInternalId]
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
  return await db.transaction(async db => {
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
      await eachConcurrent(dataEntryIds, async (id) => await versionedService.removeTag(id, 'published'))
      await db.update(`UPDATE data SET deletedBy = ?, deletedAt = NOW(), deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE dataId IN (${db.in([], dataEntryIds)})`, [userInternalId, DeleteState.DELETED, ...dataEntryIds])
    }
    const binds: (string | number)[] = [userInternalId]
    return await db.update(`UPDATE datafolders SET deletedBy = ?, deletedAt = NOW(), name = CONCAT(name, '-${deleteTime}') WHERE guid IN (${db.in(binds, folderIds)})`, binds)
  })
}

export async function undeleteDataFolders (folderIds: string[]) {
  const binds: string[] = []
  return await db.update(`UPDATE datafolders SET deletedBy = null, deletedAt = null WHERE guid IN (${db.in(binds, folderIds)})`, binds)
}
