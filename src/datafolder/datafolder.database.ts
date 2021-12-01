import db from 'mysql2-async/db'
import { DataFolder } from './datafolder.model'

export async function getDataFolders (folderInternalIds: number[]) {
  const binds: string[] = []
  const folders = await db.getall(`SELECT * FROM datafolders WHERE id IN (${db.in(binds, folderInternalIds)})`, binds)
  return folders.map(f => new DataFolder(f))
}
