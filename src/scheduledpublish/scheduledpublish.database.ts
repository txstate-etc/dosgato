import db from 'mysql2-async/db'
import { type Queryable } from 'mysql2-async'
import { ScheduledPublish, ScheduledPublishAction, type ScheduledPublishFilter, type ScheduledPublishRecurrence, ScheduledPublishStatus, type PaginationResponse } from '../internal.js'

export interface ScheduledPublishRow {
  id: number
  pageInternalId: number
  pageDataId: string | null
  dataId: string | null
  action: ScheduledPublishAction
  targetDate: Date
  status: ScheduledPublishStatus
  recur: ScheduledPublishRecurrence | null
  recurInterval: number | null
  timezone: string | null
  error: string | null
  descendant: number
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
}

function processFilters (filter?: ScheduledPublishFilter) {
  const binds: (string | number)[] = []
  const where: string[] = []
  const joins = new Map<string, string>()

  const statuses = filter?.statuses ?? [ScheduledPublishStatus.PENDING]
  where.push(`sp.status IN (${db.in(binds, statuses)})`)

  if (filter?.ids?.length) {
    where.push(`sp.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.internalIds?.length) {
    where.push(`sp.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter?.pageInternalIds?.length) {
    where.push(`sp.pageInternalId IN (${db.in(binds, filter.pageInternalIds)})`)
  }
  if (filter?.pageIds?.length) {
    joins.set('p', 'INNER JOIN pages p ON p.id = sp.pageInternalId')
    where.push(`p.dataId IN (${db.in(binds, filter.pageIds)})`)
  }
  if (filter?.actions?.length) {
    where.push(`sp.action IN (${db.in(binds, filter.actions)})`)
  }
  if (filter?.targetDateBefore) {
    binds.push(filter.targetDateBefore.toUTC().toSQL()!)
    where.push('sp.targetDate < ?')
  }
  if (filter?.targetDateAfter) {
    binds.push(filter.targetDateAfter.toUTC().toSQL()!)
    where.push('sp.targetDate > ?')
  }
  if (filter?.updatedBefore) {
    binds.push(filter.updatedBefore.toUTC().toSQL()!)
    where.push('sp.updatedAt < ?')
  }
  if (filter?.updatedAfter) {
    binds.push(filter.updatedAfter.toUTC().toSQL()!)
    where.push('sp.updatedAt > ?')
  }
  if (filter?.immediate === true) {
    where.push('sp.targetDate = sp.createdAt')
  } else if (filter?.immediate === false) {
    where.push('sp.targetDate != sp.createdAt')
  }

  return { binds, where, joins }
}

export async function getScheduledPublishes (filter?: ScheduledPublishFilter, tdb: Queryable = db, pageInfo?: PaginationResponse) {
  const { binds, where, joins } = processFilters(filter)
  let limit = ''
  if (pageInfo) {
    const offset = (pageInfo.page - 1) * pageInfo.perPage
    limit = `LIMIT ${pageInfo.perPage} OFFSET ${offset}`
    const totalCount = await tdb.getval<number>(`
      SELECT COUNT(*) FROM scheduledpublishes sp
      INNER JOIN pages ON pages.id = sp.pageInternalId
      ${[...joins.values()].join('\n')}
      WHERE (${where.join(') AND (')})
    `, binds)
    pageInfo.finalPage = Math.ceil(totalCount! / pageInfo.perPage)
  }
  const query = `SELECT sp.*, pages.dataId AS pageDataId FROM scheduledpublishes sp
    INNER JOIN pages ON pages.id = sp.pageInternalId
    ${[...joins.values()].join('\n')}
    WHERE (${where.join(') AND (')})
    ORDER BY (sp.status = 'PENDING') DESC, sp.targetDate DESC, sp.id DESC
    ${limit}`
  const rows = await tdb.getall(query, binds)
  return rows.map((row: ScheduledPublishRow) => new ScheduledPublish(row))
}

export async function countScheduledPublishes (filter?: ScheduledPublishFilter, tdb: Queryable = db) {
  const { binds, where, joins } = processFilters(filter)
  const query = `SELECT COUNT(*) FROM scheduledpublishes sp
    ${[...joins.values()].join('\n')}
    WHERE (${where.join(') AND (')})`
  return await tdb.getval<number>(query, binds) ?? 0
}

export interface ScheduledPublishRecurrenceData {
  recur: ScheduledPublishRecurrence
  recurInterval: number
  timezone: string
}

export async function createScheduledPublish (pageInternalId: number, action: ScheduledPublishAction, targetDate: Date, createdBy: string, recurrence?: ScheduledPublishRecurrenceData) {
  return await db.transaction(async db => {
    await db.getrow('SELECT id FROM pages WHERE id = ? FOR UPDATE', [pageInternalId])
    const conflictingActions = action === ScheduledPublishAction.UNPUBLISH
      ? [ScheduledPublishAction.UNPUBLISH]
      : [ScheduledPublishAction.PUBLISH, ScheduledPublishAction.PUBLISH_WITH_SUBPAGES]
    const binds: (string | number)[] = [ScheduledPublishStatus.PENDING, pageInternalId]
    const existing = await db.getval<number>(
      `SELECT id FROM scheduledpublishes WHERE status = ? AND pageInternalId = ? AND action IN (${db.in(binds, conflictingActions)}) LIMIT 1`,
      binds
    )
    if (existing) throw new Error('An active schedule of this type already exists for this page.')
    return await db.insert(
      `INSERT INTO scheduledpublishes (pageInternalId, action, targetDate, status, recur, recurInterval, timezone, createdAt, createdBy, updatedAt, updatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?)`,
      [pageInternalId, action, targetDate, ScheduledPublishStatus.PENDING, recurrence?.recur ?? null, recurrence?.recurInterval ?? null, recurrence?.timezone ?? null, createdBy, createdBy]
    )
  })
}

export async function updateScheduledPublish (id: number, updates: { action: ScheduledPublishAction, targetDate: Date, recur: ScheduledPublishRecurrence | null, recurInterval: number | null, timezone: string | null, updatedBy: string }, tdb: Queryable = db) {
  await tdb.update(
    'UPDATE scheduledpublishes SET action = ?, targetDate = ?, recur = ?, recurInterval = ?, timezone = ?, updatedAt = NOW(), updatedBy = ? WHERE id = ?',
    [updates.action, updates.targetDate, updates.recur, updates.recurInterval, updates.timezone, updates.updatedBy, id]
  )
}

export async function updateScheduledPublishStatus (id: number, status: ScheduledPublishStatus, error?: string, tdb: Queryable = db) {
  const binds: (string | number | null)[] = [status, error ?? null, id]
  await tdb.update('UPDATE scheduledpublishes SET status = ?, error = ? WHERE id = ?', binds)
}

export async function cancelActiveSchedulesForPages (pageInternalIds: number[], tdb: Queryable = db) {
  if (!pageInternalIds.length) return
  const binds: (string | number)[] = [ScheduledPublishStatus.CANCELLED, ScheduledPublishStatus.PENDING]
  await tdb.update(
    `UPDATE scheduledpublishes SET status = ? WHERE status = ? AND pageInternalId IN (${db.in(binds, pageInternalIds)})`,
    binds
  )
}

export async function logImmediatePublish (rootIds: number[], descendantIds: number[], action: ScheduledPublishAction, userId: string, tdb: Queryable = db) {
  if (!rootIds.length && !descendantIds.length) return
  const binds: any[] = [action, ScheduledPublishStatus.COMPLETED]
  const descendantClause = descendantIds.length ? `id IN (${db.in(binds, descendantIds)})` : '0'
  binds.push(userId, userId)
  await tdb.execute(
    `INSERT INTO scheduledpublishes (pageInternalId, action, targetDate, status, descendant, createdAt, createdBy, updatedAt, updatedBy)
     SELECT id, ?, NOW(), ?, ${descendantClause}, NOW(), ?, NOW(), ? FROM pages WHERE id IN (${db.in(binds, [...rootIds, ...descendantIds])})`,
    binds
  )
}

export async function logBackdatedDescendants (pageInternalIds: number[], parentSchedule: ScheduledPublish, tdb: Queryable = db) {
  if (!pageInternalIds.length) return
  const binds: any[] = [
    parentSchedule.action, parentSchedule.targetDate.toJSDate(), ScheduledPublishStatus.COMPLETED,
    parentSchedule.createdAt.toJSDate(), parentSchedule.createdBy,
    parentSchedule.updatedAt.toJSDate(), parentSchedule.updatedBy
  ]
  await tdb.execute(
    `INSERT INTO scheduledpublishes (pageInternalId, action, targetDate, status, descendant, createdAt, createdBy, updatedAt, updatedBy)
     SELECT id, ?, ?, ?, 1, ?, ?, ?, ? FROM pages WHERE id IN (${db.in(binds, pageInternalIds)})`,
    binds
  )
}

export async function getDueSchedules (tdb: Queryable = db) {
  const rows = await tdb.getall(
    `SELECT sp.*, p.dataId AS pageDataId FROM scheduledpublishes sp
     INNER JOIN pages p ON p.id = sp.pageInternalId
     WHERE sp.status = ? AND sp.targetDate <= NOW()
     ORDER BY sp.targetDate ASC`,
    [ScheduledPublishStatus.PENDING]
  )
  return rows.map((row: ScheduledPublishRow) => new ScheduledPublish(row))
}
