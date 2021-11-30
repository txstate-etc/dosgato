import db from 'mysql2-async/db'
import { Page, PageFilter } from './page.model'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { normalizePath } from '../util'

async function processFilters (filter: PageFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins: string[] = []
  const joined = new Map<string, boolean>()

  // deleted
  if (isNotNull(filter.deleted)) {
    if (filter.deleted) {
      where.push('pages.deletedAt IS NOT NULL')
    } else {
      where.push('pages.deletedAt IS NULL')
    }
  }

  // dataIds
  if (filter.ids?.length) {
    where.push(`pages.dataId IN (${db.in(binds, filter.ids)})`)
  }

  // internalIds autoincrement
  if (filter.internalIds?.length) {
    where.push(`pages.id IN (${db.in(binds, filter.internalIds)})`)
  }

  // linkIds
  if (filter.linkIds?.length) {
    where.push(`pages.linkId IN (${db.in(binds, filter.linkIds)})`)
  }

  // pagetreeIds
  if (filter.pagetreeIds?.length) {
    where.push(`pages.pagetreeId IN (${db.in(binds, filter.pagetreeIds)})`)
  }

  // internalIdPaths for getting direct descendants of a page
  if (filter.internalIdPaths?.length) {
    where.push(`pages.path IN (${db.in(binds, filter.internalIdPaths)})`)
  }

  // internalIdPathsRecursive for getting all descendants of a page
  if (filter.internalIdPathsRecursive?.length) {
    const ors = filter.internalIdPathsRecursive.map(path => 'pages.path LIKE ?')
    where.push(ors.join(' OR '))
    binds.push(...filter.internalIdPathsRecursive.map(p => `${p}%`))
  }

  // pagetreeTypes
  if (filter.pagetreeTypes?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
    if (!joined.has('pagetrees')) {
      joins.push('INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id')
      joined.set('pagetrees', true)
    }
  }

  // siteIds
  if (filter.siteIds?.length) {
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
    if (!joined.has('pagetrees')) {
      joins.push('INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id')
      joined.set('pagetrees', true)
    }
  }

  // named paths e.g. /site1/about
  if (filter.paths?.length) {
    const paths = filter.paths.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
    const names = new Set<string>(paths.flat())
    const namebinds = Array.from(names)
    const rows = await db.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM pages WHERE name IN (${namebinds.map(n => '?').join(',')})`, namebinds)
    const rowsByNameAndPath: Record<string, Record<string, typeof rows[number][]>> = {}
    for (const row of rows) {
      rowsByNameAndPath[row.name] ??= {}
      rowsByNameAndPath[row.name][row.path] ??= []
      rowsByNameAndPath[row.name][row.path].push(row)
    }
    where.push(`(pages.name, pages.path) IN (${db.in(binds, paths.flatMap(pt => {
      let searchpaths = ['/']
      for (const segment of pt.slice(0, -1)) {
        const pages = searchpaths.flatMap(sp => rowsByNameAndPath[segment][sp])
        if (!pages.length) return undefined
        searchpaths = searchpaths.flatMap(sp => pages.map(pg => `${sp}${sp === '/' ? '' : '/'}${pg.id}`))
      }

      return searchpaths.map(sp => [pt[pt.length - 1], sp])
    }).filter(isNotNull))})`)
  }

  // published TODO
  // live TODO
  // templateKeys TODO
  // pages, assets, data referenced TODO

  return { binds, where, joins }
}

export async function getPages (filter: PageFilter) {
  const { binds, where, joins } = await processFilters(filter)
  const pages = await db.getall(`SELECT pages.* FROM pages
                           ${joins.join('\n')}
                           WHERE (${where.join(') AND (')})`, binds)
  return pages.map(p => new Page(p))
}

export async function movePage (dataId: string, newParentDataId: string) {
  return await db.transaction(async db => {
    const pages = (await db.getall('SELECT * FROM pages WHERE dataId IN (?,?)', [dataId, newParentDataId])).map(r => new Page(r))
    const page = pages.find(p => p.dataId === dataId)
    const parent = pages.find(p => p.dataId === newParentDataId)

    if (!page) throw new Error('Cannot move page that does not exist.')
    if (!parent) throw new Error('Cannot move page into parent that does not exist.')
    if (page.pathSplit.length === 0) throw new Error('Root pages cannot be moved.')
    // TODO make sure target site/pagetree allows the page template? all component templates?
    if (parent.path.startsWith(page.path)) throw new Error('Cannot move a page into its own subtree.')

    const descendants = (await db.getall('SELECT * FROM pages WHERE id=? OR path LIKE ?', [page.internalId, `/${[...page.pathSplit, page.internalId].join('/')}%`])).map(r => new Page(r))
    const pathsize = page.pathSplit.length
    for (const d of descendants) {
      const newPath = `/${[...parent.pathSplit, parent.internalId, ...d.pathSplit.slice(pathsize)].join('/')}`
      await db.update('UPDATE pages SET path = ? WHERE id=?', [newPath, d.internalId])
    }

    return new Page(await db.getrow('SELECT * FROM pages WHERE id=?', [page.internalId]))
  })
}
