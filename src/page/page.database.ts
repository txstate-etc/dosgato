import db from 'mysql2-async/db'
import { DateTime } from 'luxon'
import { Queryable } from 'mysql2-async'
import { nanoid } from 'nanoid'
import { hashify, isNotBlank, isNotNull } from 'txstate-utils'
import { Page, PageFilter, VersionedService, normalizePath } from 'internal'

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

export async function getPages (filter: PageFilter, tdb: Queryable = db) {
  const { binds, where, joins } = await processFilters(filter)
  const pages = await tdb.getall(`SELECT pages.* FROM pages
                           ${joins.join('\n')}
                           ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
                           ORDER BY \`path\`, displayOrder`, binds)
  return pages.map(p => new Page(p))
}

async function refetch (db: Queryable, ...pages: (Page|undefined)[]) {
  const refetched = hashify(await getPages({ internalIds: pages.filter(isNotNull).map(p => p.internalId) }, db), 'internalId')
  return pages.map(p => refetched[p?.internalId ?? 0])
}

async function handleDisplayOrder (db: Queryable, parent: Page, aboveTarget: Page) {
  const pathToParent = `/${[...parent.pathSplit, parent.internalId].join('/')}`
  let displayOrder
  if (aboveTarget) {
    displayOrder = aboveTarget.displayOrder
    await db.update('UPDATE pages SET displayOrder=displayOrder + 1 WHERE path=? AND displayOrder >= ?', [pathToParent, displayOrder])
  } else {
    const maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM pages WHERE path=?', [pathToParent])
    displayOrder = (maxDisplayOrder ?? 0) + 1
  }
  return displayOrder
}

export async function createPage (versionedService: VersionedService, userId: string, parent: Page, aboveTarget: Page|undefined, name: string, templateKey: string, schemaVersion: DateTime) {
  return await db.transaction(async db => {
    [parent, aboveTarget] = await refetch(db, parent, aboveTarget)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }
    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget)
    const dataId = await versionedService.create('page', { templateKey, savedAtVersion: schemaVersion }, [{ name: 'template', values: [templateKey] }], userId, db)
    const newInternalId = await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)
    `, [name, `/${[...parent.pathSplit, parent.internalId].join('/')}`, displayOrder, parent.pagetreeId, dataId, nanoid(10)])
    // return the newly created page
    return new Page(await db.getrow('SELECT * FROM pages WHERE id=?', [newInternalId]))
  })
}

export async function movePage (page: Page, parent: Page, aboveTarget?: Page) {
  return await db.transaction(async db => {
    // refetch pages inside transaction for safety
    [page, parent, aboveTarget] = await refetch(db, page, parent, aboveTarget)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }

    if (parent.path.startsWith(page.path)) throw new Error('Cannot move a page into its own subtree.')

    // We cannot allow pages to be moved between pagetrees because linkId collision could occur.
    // linkId collision can also occur on a copy, but in that case we can generate a new linkId
    // automatically and the operation can still be undone. For instance, if you move a page to
    // a new pagetree and give it a new linkId in the process, but that move was a mistake, lots
    // of links will break and there's no way to restore them. Also, moving a page always moves
    // all of its subpages, so the problem would be multiplied by the number of descendants.
    if (parent.pagetreeId !== page.pagetreeId) throw new Error('Moving between sites or pagetrees is not allowed. Copy instead.')

    // deal with displayOrder
    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget)

    // update the page itself, currently just displayOrder
    await db.update('UPDATE pages SET displayOrder=? WHERE id=?', [displayOrder, page.internalId])

    // correct the path column for page and all its descendants
    const descendants = (await db.getall('SELECT * FROM pages WHERE id=? OR path LIKE ?', [page.internalId, `/${[...page.pathSplit, page.internalId].join('/')}%`])).map(r => new Page(r))
    const pathsize = page.pathSplit.length
    for (const d of descendants) {
      const newPath = `/${[...parent.pathSplit, parent.internalId, ...d.pathSplit.slice(pathsize)].join('/')}`
      await db.update('UPDATE pages SET path=? WHERE id=?', [newPath, d.internalId])
    }

    // return the newly updated page
    return new Page(await db.getrow('SELECT * FROM pages WHERE id=?', [page.internalId]))
  })
}

export async function deletePage (page: Page, userInternalId: number) {
  const binds: string[] = []
  return await db.transaction(async db => {
    binds.push(String(userInternalId))
    const children = await getPages({ internalIdPathsRecursive: [`${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`] }, db)
    const childInternalIds = children.map(c => c.internalId)
    await db.update(`UPDATE pages SET deletedAt = NOW(), deletedBy = ? WHERE id IN (${db.in(binds, [String(page.internalId), ...childInternalIds])})`, binds)
    // TODO: handle display order or just leave it? Deleted pages might be displayed in the UI so it might make sense to
    // maintain their position. Or we might want to adjust the display orders for the sibling pages that come after the deleted page?
  })
}

export async function renamePage (page: Page, name: string) {
  return await db.update('UPDATE pages SET name = ? WHERE id = ?', [name, page.internalId])
}
