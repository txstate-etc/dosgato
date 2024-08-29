import db from 'mysql2-async/db'

export async function getPageTagIds (internalIds: number[]) {
  const binds: number[] = []
  return await db.getall<{ tagId: string, pageId: number }>(`SELECT tagId, pageId FROM pages_tags WHERE pageId IN (${db.in(binds, internalIds)})`, binds)
}

export async function getTagPageIds (tagIds: string[]) {
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

export async function replaceUserTags (tagIds: string[], pageInternalId: number) {
  await db.transaction(async db => {
    let binds: any[] = [pageInternalId]
    let query = 'DELETE FROM pages_tags WHERE pageId = ?'
    if (tagIds.length) {
      query += ` AND tagId NOT IN (${db.in(binds, tagIds)})`
    }
    await db.delete(query, binds)
    binds = []
    if (tagIds.length) {
      await db.insert(`INSERT INTO pages_tags (tagId, pageId) VALUES ${db.in(binds, tagIds.map(tagId => [tagId, pageInternalId]))} ON DUPLICATE KEY UPDATE tagId=tagId`, binds)
    }
  })
}
