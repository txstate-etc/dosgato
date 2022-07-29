import db from 'mysql2-async/db'
import { Queryable } from 'mysql2-async'
import { SiteComment, SiteCommentFilter } from '../internal.js'

export async function getSiteComments (filter?: SiteCommentFilter) {
  const binds: string[] = []
  const where: string[] = []

  if (filter?.ids?.length) {
    where.push(`comments.id IN (${db.in(binds, filter.ids)})`)
  }

  if (filter?.siteIds?.length) {
    where.push(`comments.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter?.users?.length) {
    where.push(`users.login IN (${db.in(binds, filter.users)})`)
  }
  let query = 'SELECT comments.* from comments '
  if (filter?.users?.length) {
    query += 'INNER JOIN users on users.id = comments.createdBy '
  }
  if (where.length) {
    query += `WHERE (${where.join(') AND (')})`
  }
  const comments = await db.getall(query, binds)
  return comments.map(c => new SiteComment(c))
}

export async function createSiteComment (siteId: string, comment: string, userInternalId: number, tdb: Queryable = db) {
  return await tdb.insert(`INSERT INTO comments (siteId, comment, createdAt, createdBy)
                          VALUES (?, ?, NOW(), ?)`, [siteId, comment, userInternalId])
}
