import db from 'mysql2-async/db'
import { Page, PageFilter } from './page.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: PageFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins: string[] = []
  const joined = new Map<string, boolean>()
  // activePagetree
  // assetKeysReferenced
  if (isNotNull(filter.deleted)) {
    if (filter.deleted) {
      where.push('pages.deletedAt IS NOT NULL')
    } else {
      where.push('pages.deletedAt IS NULL')
    }
  }
  if (filter.ids?.length) {
    where.push(`pages.dataId IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.internalIds?.length) {
    where.push(`pages.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter.linkIds?.length) {
    where.push(`pages.linkId IN (${db.in(binds, filter.linkIds)})`)
  }
  // linkIdsReferenced
  // live
  if (filter.pageTreeIds?.length) {
    where.push(`pages.pagetreeId IN (${db.in(binds, filter.pageTreeIds)})`)
  }
  if (filter.parentInternalIds?.length) {
    where.push(`pages.parentId IN (${db.in(binds, filter.parentInternalIds)})`)
  }
  // published
  // referencedByPageIds
  if (filter.siteIds?.length) {
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
    if (!joined.has('pagetrees')) {
      joins.push('INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id')
      joined.set('pagetrees', true)
    }
  }
  // templateKeys

  return { binds, where, joins }
}

export async function getPages (filter: PageFilter) {
  const { binds, where, joins } = processFilters(filter)
  const pages = await db.getall(`SELECT pages.* FROM pages
                           ${joins.join('\n')}
                           WHERE (${where.join(') AND (')})`, binds)
  return pages.map(p => new Page(p))
}
