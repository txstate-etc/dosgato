import db from 'mysql2-async/db'
import { Queryable } from 'mysql2-async'
import { nanoid } from 'nanoid'
import { isNotBlank, isNotNull, keyby, mapConcurrent, unique, someConcurrent, filterAsync, sortby } from 'txstate-utils'
import { Page, PageFilter, VersionedService, normalizePath, formatSavedAtVersion, DeletedFilter, templateRegistry, getPageIndexes } from '../internal.js'
import { PageData } from '@dosgato/templating'

async function convertPathsToIDPaths (pathstrings: string[]) {
  const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
  const names = new Set<string>(paths.flat())
  const binds: string[] = []
  const rows = await db.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM pages WHERE name IN (${db.in(binds, Array.from(names))})`, binds)
  const rowsByNameAndIDPath: Record<string, Record<string, typeof rows[number][]>> = {}
  for (const row of rows) {
    rowsByNameAndIDPath[row.name] ??= {}
    rowsByNameAndIDPath[row.name][row.path] ??= []
    rowsByNameAndIDPath[row.name][row.path].push(row)
  }
  const idpaths: string[] = []
  for (const pt of paths) {
    let searchpaths = ['/']
    for (const segment of pt) {
      const pages = searchpaths.flatMap(sp => rowsByNameAndIDPath[segment][sp])
      searchpaths = pages.map(pg => `${pg.path}${pg.path === '/' ? '' : '/'}${pg.id}`)
      if (!searchpaths.length) break
    }
    idpaths.push(...searchpaths)
  }
  return idpaths
}

async function processFilters (filter: PageFilter) {
  const binds: string[] = []
  const where: string[] = []
  const joins = new Map<string, string>()

  if (filter.deleted) {
    if (filter.deleted === DeletedFilter.ONLY) {
      where.push('pages.deletedAt IS NOT NULL')
    } else if (filter.deleted === DeletedFilter.HIDE) {
      where.push('pages.deletedAt IS NULL')
    }
  } else {
    where.push('pages.deletedAt IS NULL')
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
    const ors = filter.internalIdPathsRecursive.flatMap(path => ['pages.path LIKE ?', 'pages.path = ?'])
    where.push(ors.join(' OR '))
    binds.push(...filter.internalIdPathsRecursive.flatMap(p => [`${p}/%`, p]))
  }

  // pagetreeTypes
  if (filter.pagetreeTypes?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
    if (!joins.has('pagetrees')) {
      joins.set('pagetrees', 'INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id')
    }
  }

  // siteIds
  if (filter.siteIds?.length) {
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
    if (!joins.has('pagetrees')) {
      joins.set('pagetrees', 'INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id')
    }
  }

  // named paths e.g. /site1/about
  if (filter.paths?.length) {
    const idpaths = await convertPathsToIDPaths(filter.paths)
    const ids = idpaths.map(p => p.split(/\//).slice(-1)[0])
    where.push(`pages.id IN (${db.in(binds, ids)})`)
  }

  // beneath a named path e.g. /site1/about
  if (filter.beneath?.length) {
    const idpaths = await convertPathsToIDPaths(filter.beneath)
    const ors = idpaths.flatMap(p => ['pages.path LIKE ?', 'pages.path = ?'])
    binds.push(...idpaths.flatMap(p => [`${p}/%`, p]))
    where.push(ors.join(' OR '))
  }

  // direct children of a named path e.g. /site1/about
  if (filter.parentPaths?.length) {
    const idpaths = await convertPathsToIDPaths(filter.parentPaths)
    where.push(`pages.path IN (${db.in(binds, idpaths)})`)
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
                           ${joins.size ? Array.from(joins.values()).join('\n') : ''}
                           ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
                           ORDER BY \`path\`, displayOrder`, binds)
  return pages.map(p => new Page(p))
}

async function refetch (db: Queryable, ...pages: (Page|undefined)[]) {
  const refetched = keyby(await getPages({ internalIds: pages.filter(isNotNull).map(p => p.internalId), deleted: DeletedFilter.SHOW }, db), 'internalId')
  return pages.map(p => refetched[p?.internalId ?? 0])
}

async function handleDisplayOrder (db: Queryable, parent: Page, aboveTarget: Page, pagesAdded: number = 1) {
  const pathToParent = `/${[...parent.pathSplit, parent.internalId].join('/')}`
  let displayOrder
  if (aboveTarget) {
    displayOrder = aboveTarget.displayOrder
    await db.update(`UPDATE pages SET displayOrder=displayOrder + ${pagesAdded} WHERE path=? AND displayOrder >= ?`, [pathToParent, displayOrder])
  } else {
    const maxDisplayOrder = await db.getval<number>('SELECT MAX(displayOrder) FROM pages WHERE path=?', [pathToParent])
    displayOrder = (maxDisplayOrder ?? 0) + 1
  }
  return displayOrder
}

async function updateSourceDisplayOrder (db: Queryable, page: Page, parent: Page) {
  // If page parent isn't changing, there is no hole left behind
  if (page.parentInternalId === parent.internalId) return
  await db.update('UPDATE pages SET displayOrder = displayOrder - 1 WHERE path = ? AND displayOrder > ?', [page.path, page.displayOrder])
}

export async function createPage (versionedService: VersionedService, userId: string, parent: Page, aboveTarget: Page|undefined, name: string, data: PageData, linkId: string) {
  return await db.transaction(async db => {
    [parent, aboveTarget] = await refetch(db, parent, aboveTarget)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }
    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget)
    const indexes = getPageIndexes(data)
    const dataId = await versionedService.create('page', data, indexes, userId, db)
    const newInternalId = await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)
    `, [name, `/${[...parent.pathSplit, parent.internalId].join('/')}`, displayOrder, parent.pagetreeId, dataId, linkId])
    // return the newly created page
    return new Page(await db.getrow('SELECT * FROM pages WHERE id=?', [newInternalId]))
  })
}

export async function movePages (pages: Page[], parent: Page, aboveTarget?: Page) {
  return await db.transaction(async db => {
    // refetch pages inside transaction for safety
    [parent, aboveTarget, ...pages] = await refetch(db, parent, aboveTarget, ...pages)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }

    if (await someConcurrent(pages, async (page) => parent.path.startsWith(page.path + '/'))) {
      throw new Error('Cannot move a page into its own subtree.')
    }

    // We cannot allow pages to be moved between pagetrees because linkId collision could occur.
    // linkId collision can also occur on a copy, but in that case we can generate a new linkId
    // automatically and the operation can still be undone. For instance, if you move a page to
    // a new pagetree and give it a new linkId in the process, but that move was a mistake, lots
    // of links will break and there's no way to restore them. Also, moving a page always moves
    // all of its subpages, so the problem would be multiplied by the number of descendants.
    if (await someConcurrent(pages, async (page) => parent.pagetreeId !== page.pagetreeId)) {
      throw new Error('Moving between sites or pagetrees is not allowed. Copy instead.')
    }

    // If page selected to be moved is a descendent of one of the other pages being moved,
    // we don't need to move it because it will be moved with its ancestor
    let filteredPages = await filterAsync(pages, async (page) => {
      return !(await someConcurrent(pages, async (p) => (p.internalId !== page.internalId) && page.path.startsWith(p.path + '/')))
    })
    filteredPages = sortby(filteredPages, 'displayOrder')

    // deal with displayOrder
    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget, filteredPages.length)

    // fill in any display order holes in the moved pages' previous location(s)
    for (const p of pages) {
      await updateSourceDisplayOrder(db, p, parent)
    }
    // update the pages themselves, currently just displayOrder.
    await Promise.all(filteredPages.map(async (page, index) => await db.update('UPDATE pages SET displayOrder = ? WHERE id = ?', [displayOrder + index, page.internalId])))

    // correct the path column for pages and all their descendants
    for (const p of filteredPages) {
      const descendants = (await db.getall('SELECT * FROM pages WHERE id=? OR path LIKE ?', [p.internalId, `/${[...p.pathSplit, p.internalId].join('/')}%`])).map(r => new Page(r))
      const pathsize = p.pathSplit.length
      for (const d of descendants) {
        const newPath = `/${[...parent.pathSplit, parent.internalId, ...d.pathSplit.slice(pathsize)].join('/')}`
        await db.update('UPDATE pages SET path=? WHERE id=?', [newPath, d.internalId])
      }
    }

    // return the newly updated pages
    const binds: number[] = []
    const updatedPages = await db.getall(`SELECT * FROM pages WHERE id IN (${db.in(binds, filteredPages.map(p => p.internalId))})`, binds)
    return updatedPages.map(p => new Page(p))
  })
}

async function handleCopy (db: Queryable, versionedService: VersionedService, userId: string, page: Page, parent: Page, displayOrder: number, includeChildren?: boolean) {
  const pageData = await versionedService.get(page.dataId)
  const pageIndexes = await versionedService.getIndexes(page.dataId, pageData!.version)
  const newDataId = await versionedService.create('page', pageData!.data, pageIndexes, userId, db)
  let newPageName: string = String(page.name)
  const pagesWithName = new Set(await db.getvals<string>('SELECT name FROM pages WHERE name LIKE ? AND path = ?', [`${String(page.name)}%`, `/${[...parent.pathSplit, parent.internalId].join('/')}`]))
  if (pagesWithName.size > 0) {
    let idx = 0
    newPageName = `${String(page.name)}${idx}`
    while (pagesWithName.has(newPageName)) {
      newPageName = `${String(page.name)}${++idx}`
    }
  }
  const newInternalId = await db.insert(`
    INSERT INTO pages (name, pagetreeId, dataId, linkId, path, displayOrder)
    VALUES (?, ?, ?, ?, ?, ?)`, [newPageName, parent.pagetreeId, newDataId, nanoid(10), `/${[...parent.pathSplit, parent.internalId].join('/')}`, displayOrder])
  if (includeChildren) {
    const children = (await db.getall('SELECT * FROM pages WHERE path = ?', [`/${[...page.pathSplit, page.internalId].join('/')}`])).map(r => new Page(r))
    const newParent = new Page(await db.getrow('SELECT * FROM pages WHERE id = ?', [newInternalId]))
    for (const child of children) {
      await handleCopy(db, versionedService, userId, child, newParent, child.displayOrder, true)
    }
  }
  return newDataId
}

export async function copyPages (versionedService: VersionedService, userId: string, pages: Page[], parent: Page, aboveTarget?: Page, includeChildren?: boolean) {
  return await db.transaction(async db => {
    [parent, aboveTarget, ...pages] = await refetch(db, parent, aboveTarget, ...pages)

    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }

    pages = sortby(pages, 'displayOrder')

    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget, pages.length)

    let i = 0
    for (const page of pages) {
      await handleCopy(db, versionedService, userId, page, parent, displayOrder + i, includeChildren)
      i++
    }
    return parent
  })
}

// TODO: always delete child pages? Or make it an option?
export async function deletePages (pages: Page[], userInternalId: number) {
  return await db.transaction(async db => {
    const binds: (string | number)[] = [userInternalId]
    const refetchedPages = await refetch(db, ...pages)
    const pageInternalIds = refetchedPages.map(p => p.internalId)
    const children = (await mapConcurrent(refetchedPages, async (page) => await getPages({ deleted: DeletedFilter.SHOW, internalIdPathsRecursive: [`${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`] }, db))).flat()
    const childInternalIds = children.map(c => c.internalId)
    await db.update(`UPDATE pages SET deletedAt = NOW(), deletedBy = ? WHERE id IN (${db.in(binds, unique([...pageInternalIds, ...childInternalIds]))})`, binds)
  })
}

export async function undeletePages (pages: Page[]) {
  return await db.transaction(async db => {
    const binds: string[] = []
    const refetchedPages = await refetch(db, ...pages)
    return await db.update(`
      UPDATE pages
      SET deletedAt = NULL, deletedBy = NULL
      WHERE id IN (${db.in(binds, refetchedPages.map(p => p.internalId))})`, binds)
  })
}

export async function renamePage (page: Page, name: string) {
  return await db.update('UPDATE pages SET name = ? WHERE id = ?', [name, page.internalId])
}
