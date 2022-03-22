import db from 'mysql2-async/db'
import { isNotNull } from 'txstate-utils'
import { nanoid } from 'nanoid'
import { DataFolder, DataFolderFilter, CreateDataFolderInput } from 'internal'

export async function getDataFolders (filter: DataFolderFilter) {
  const where: string[] = []
  const binds: string[] = []
  // const joins: string[] = []
  // const joined = new Map<string, boolean>()

  if (filter.internalIds?.length) {
    where.push(`datafolders.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter.ids?.length) {
    where.push(`datafolders.guid IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.templateKeys?.length) {
    // TODO
  }
  if (filter.templateIds?.length) {
    where.push(`datafolders.templateId IN (${db.in(binds, filter.templateIds)})`)
  }
  if (filter.siteIds?.length) {
    where.push(`datafolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (isNotNull(filter.deleted)) {
    if (filter.deleted) {
      where.push('datafolders.deletedAt IS NOT NULL')
    } else {
      where.push('datafolders.deletedAt IS NULL')
    }
  }
  if (!where.length) {
    throw new Error('Must include a filter')
  }
  const folders = await db.getall(`SELECT * FROM datafolders WHERE (${where.join(') AND (')})`, binds)
  return folders.map(f => new DataFolder(f))
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

export async function deleteDataFolder (folderId: string, userInternalId: number) {
  return await db.update('UPDATE datafolders SET deletedBy = ?, deletedAt = NOW() WHERE guid = ?', [userInternalId, folderId])
}

export async function undeleteDataFolder (folderId: string) {
  return await db.update('UPDATE datafolders SET deletedBy = null, deletedAt = null WHERE guid = ?', [folderId])
}
