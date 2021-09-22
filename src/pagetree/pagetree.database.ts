import db from 'mysql2-async/db'
import { PageTree, PageTreeFilter } from './pagetree.model'

export async function getPagetreesBySite (siteIds: number[], filter?: PageTreeFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`pagetrees.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.types?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.types)})`)
  }
  where.push(`pagetrees.siteID IN (${db.in(binds, siteIds)})`)
  const pagetrees = await db.getall(`SELECT * from pagetrees
                     WHERE (${where.join(') AND (')})`, binds)
  return pagetrees.map(p => new PageTree(p))
}
