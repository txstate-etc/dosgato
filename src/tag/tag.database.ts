import db from 'mysql2-async/db'
import { DeleteStateDefault, getPages } from '../internal.js'

export async function getPageTagsByPageIds (internalIds: number[]) {
  const binds: number[] = []
  return await db.getall<{ tagId: string, pageId: number }>(`SELECT tagId, pageId FROM pages_tags WHERE pageId IN (${db.in(binds, internalIds)})`, binds)
}

export async function getPageTagsByTagIds (tagIds: string[]) {
  const binds: number[] = []
  return await db.getall<{ tagId: string, pageId: number }>(`SELECT tagId, pageId FROM pages_tags WHERE tagId IN (${db.in(binds, tagIds)})`, binds)
}

export async function addUserTags (tagIds: string[], pageInternalIds: number[]) {
  const pairs: [string, number][] = []
  for (const tagId of tagIds) {
    for (const pageId of pageInternalIds) pairs.push([tagId, pageId])
  }
  const binds: any[] = []
  await db.insert(`INSERT INTO pages_tags (tagId, pageId) VALUES ${db.in(binds, pairs)} ON DUPLICATE KEY UPDATE tagId=tagId`, binds)
}

export async function removeUserTags (tagIds: string[], pageInternalIds: number[]) {
  const pairs: [string, number][] = []
  for (const tagId of tagIds) {
    for (const pageId of pageInternalIds) pairs.push([tagId, pageId])
  }
  const binds: any[] = []
  await db.insert(`DELETE FROM pages_tags WHERE (tagId, pageId) IN (${db.in(binds, pairs)})`, binds)
}

export async function replaceUserTags (tagIds: string[], pageInternalIds: number[], includeChildren?: boolean) {
  await db.transaction(async db => {
    let binds: any[] = []
    let childInternalIds: number[] = []
    if (includeChildren) {
      const refetchedPages = await getPages({ internalIds: pageInternalIds }, db)
      const children = await getPages({ deleteStates: DeleteStateDefault, internalIdPathsRecursive: refetchedPages.map(page => `${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`) }, db)
      childInternalIds = children.map(p => p.internalId)
    }

    let query = `DELETE FROM pages_tags WHERE pageId IN (${db.in(binds, [...pageInternalIds, ...childInternalIds])})`
    if (tagIds.length) {
      query += ` AND tagId NOT IN (${db.in(binds, tagIds)})`
    }
    await db.delete(query, binds)
    binds = []
    if (tagIds.length) {
      const values: string[] = []
      for (const tagId of tagIds) {
        for (const pageInternalId of [...pageInternalIds, ...childInternalIds]) {
          values.push(`('${tagId}', ${pageInternalId})`)
        }
      }
      await db.insert(`INSERT INTO pages_tags (tagId, pageId) VALUES ${values.join(', ')} ON DUPLICATE KEY UPDATE tagId=tagId`)
    }
  })
}
