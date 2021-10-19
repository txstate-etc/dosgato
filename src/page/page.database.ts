import db from 'mysql2-async/db'
import { Page, PageFilter } from './page.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter: PageFilter) {
  const binds: string[] = []
  const where: string[] = []
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
    where.push(`pages.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.linkIds?.length) {
    where.push(`pages.linkId IN (${db.in(binds, filter.linkIds)})`)
  }
  // linkIdsReferenced
  // live
  if (filter.pageTreeIds?.length) {
    where.push(`pages.pagetreeId IN (${db.in(binds, filter.pageTreeIds)})`)
  }
  if (filter.parentPageIds?.length) {
    where.push(`pages.parentId IN (${db.in(binds, filter.parentPageIds)})`)
  }
  // published
  // referencedByPageIds
  // siteIds
  // templateKeys

  return { binds, where }
}

export async function getPages (filter: PageFilter) {
  const { binds, where } = processFilters(filter)
  const pages = await db.getall(`SELECT * FROM pages
                           WHERE (${where.join(') AND (')})`, binds)
  return pages.map(p => new Page(p))
}
