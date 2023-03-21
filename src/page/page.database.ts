/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import db from 'mysql2-async/db'
import { Queryable } from 'mysql2-async'
import { nanoid } from 'nanoid'
import { isNotBlank, isNotNull, keyby, unique, sortby } from 'txstate-utils'
import { Page, PageFilter, VersionedService, normalizePath, getPageIndexes, DeleteState, numerate, DeleteStateAll, DeleteStateInput, DeleteStateDefault } from '../internal.js'
import { PageData } from '@dosgato/templating'
import { DateTime } from 'luxon'

export interface CreatePageInput extends UpdatePageInput {
  abovePage?: string
}

export interface UpdatePageInput {
  publishedBy?: string
  publishedAt?: string
  migrate?: boolean
}

export interface CreatePageExtras extends CreatePageInput {
  createdBy?: string
  createdAt?: string
  modifiedBy?: string
  modifiedAt?: string
  linkId?: string
}

export interface UpdatePageExtras extends UpdatePageInput {
  modifiedBy?: string
  modifiedAt?: string
}

async function convertPathsToIDPaths (pathstrings: string[]) {
  const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
  const names = new Set<string>(paths.flat())
  const binds: string[] = []
  const rows = names.size ? await db.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM pages WHERE name IN (${db.in(binds, Array.from(names))})`, binds) : []
  const rowsByNameAndIDPath: Record<string, Record<string, typeof rows[number]>> = {}
  for (const row of rows) {
    rowsByNameAndIDPath[row.name] ??= {}
    rowsByNameAndIDPath[row.name][row.path] = row
  }
  const idpaths: string[] = []
  for (const entry of paths) {
    let lastpath = '/'
    let finished = false
    for (let i = 0; i < entry.length; i++) {
      const segment = entry[i]
      const page = rowsByNameAndIDPath[segment]?.[lastpath]
      if (!page) break
      lastpath = `${page.path}${page.path === '/' ? '' : '/'}${page.id}`
      finished = (i === entry.length - 1)
    }
    if ((finished && lastpath !== '/') || entry.length === 0) idpaths.push(lastpath)
  }
  return idpaths
}

export function processDeletedFilters (filter: any, tableName: string, orphansJoins: Map<string, string>, excludeOrphansClause: string, onlyOrphansClause: string) {
  const binds: any[] = []
  const where: string[] = []
  let joins = new Map<string, string>()
  let deleteStates = new Set(filter?.deleteStates ?? DeleteStateDefault)
  if (deleteStates.has(DeleteStateInput.ALL)) deleteStates = new Set(DeleteStateAll)
  if (
    !deleteStates.has(DeleteStateInput.NOTDELETED) ||
    !deleteStates.has(DeleteStateInput.MARKEDFORDELETE) ||
    !deleteStates.has(DeleteStateInput.DELETED) ||
    !deleteStates.has(DeleteStateInput.ORPHAN_MARKEDFORDELETE) ||
    !deleteStates.has(DeleteStateInput.ORPHAN_NOTDELETED) ||
    !deleteStates.has(DeleteStateInput.ORPHAN_DELETED)
  ) {
    const deleteOrs: any[] = []
    if (deleteStates.has(DeleteStateInput.NOTDELETED) !== deleteStates.has(DeleteStateInput.ORPHAN_NOTDELETED)) {
      joins = orphansJoins
      if (deleteStates.has(DeleteStateInput.ORPHAN_NOTDELETED)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.NOTDELETED}${onlyOrphansClause}`)
      } else {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.NOTDELETED}${excludeOrphansClause}`)
      }
    } else {
      if (deleteStates.has(DeleteStateInput.ORPHAN_NOTDELETED)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.NOTDELETED}`)
      }
    }
    if (deleteStates.has(DeleteStateInput.MARKEDFORDELETE) !== deleteStates.has(DeleteStateInput.ORPHAN_MARKEDFORDELETE)) {
      joins = orphansJoins
      if (deleteStates.has(DeleteStateInput.ORPHAN_MARKEDFORDELETE)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.MARKEDFORDELETE}${onlyOrphansClause}`)
      } else {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.MARKEDFORDELETE}${excludeOrphansClause}`)
      }
    } else {
      if (deleteStates.has(DeleteStateInput.ORPHAN_MARKEDFORDELETE)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.MARKEDFORDELETE}`)
      }
    }
    if (deleteStates.has(DeleteStateInput.DELETED) !== deleteStates.has(DeleteStateInput.ORPHAN_DELETED)) {
      joins = orphansJoins
      if (deleteStates.has(DeleteStateInput.ORPHAN_DELETED)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.DELETED}${onlyOrphansClause}`)
      } else {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.DELETED}${excludeOrphansClause}`)
      }
    } else {
      if (deleteStates.has(DeleteStateInput.ORPHAN_DELETED)) {
        deleteOrs.push(`${tableName}.deleteState = ${DeleteState.DELETED}`)
      }
    }
    where.push(`(${deleteOrs.join(') OR (')})`)
  }
  return { binds, where, joins }
}

async function processFilters (filter?: PageFilter) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'pages',
    new Map([
      ['sites', 'INNER JOIN sites ON pages.siteId = sites.id'],
      ['pagetrees', 'INNER JOIN pagetrees ON pages.pagetreeId = pagetrees.id']
    ]),
    ' AND sites.deletedAt IS NULL AND pagetrees.deletedAt IS NULL',
    ' AND (sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL)'
  )

  if (filter == null) return { binds, joins, where }

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
    joins.set('pagetrees', 'INNER JOIN pagetrees ON pages.pagetreeId = pagetrees.id')
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
  }

  // siteIds
  if (filter.siteIds?.length) {
    joins.set('pagetrees', 'INNER JOIN pagetrees ON pages.pagetreeId = pagetrees.id')
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
  }

  await Promise.all([
    (async () => {
      // named paths e.g. /site1/about
      if (filter.paths?.length) {
        const idpaths = await convertPathsToIDPaths(filter.paths)
        const ids = ['-1', ...idpaths.map(p => p.split(/\//).slice(-1)[0])]
        where.push(`pages.id IN (${db.in(binds, ids)})`)
      }
    })(),
    (async () => {
      // beneath a named path e.g. /site1/about
      if (filter.beneath?.length) {
        const idpaths = await convertPathsToIDPaths(filter.beneath)
        const ors = idpaths.flatMap(p => ['pages.path LIKE ?', 'pages.path = ?'])
        binds.push(...idpaths.flatMap(p => [`${p}/%`, p]))
        where.push(ors.join(' OR '))
      }
    })(),
    (async () => {
      // direct children of a named path e.g. /site1/about
      if (filter.parentPaths?.length) {
        const idpaths = await convertPathsToIDPaths(filter.parentPaths)
        where.push(`pages.path IN (${db.in(binds, idpaths)})`)
      }
    })()
  ])

  if (filter.maxDepth === 0) {
    where.push('pages.path = "/"')
  } else if (filter.maxDepth != null) {
    where.push('LENGTH(pages.path) - LENGTH(REPLACE(pages.path, "/", "")) <= ?')
    binds.push(filter.maxDepth)
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
                           ORDER BY pages.\`path\`, pages.displayOrder, pages.name`, binds)
  return pages.map(p => new Page(p))
}

export async function getPagesByPath (paths: string[], filter: PageFilter) {
  const pages = await getPages({ ...filter, paths })
  const parents = await getPages({ internalIds: [-1, ...pages.flatMap(p => p.pathSplit)] })
  const parentLookup = keyby(parents, 'internalId')
  const ret = pages.map(p => ({ key: '/' + [...p.pathSplit.map(id => parentLookup[id].name), p.name].join('/'), value: p }))
  return ret
}

async function refetch (db: Queryable, ...pages: (Page | undefined)[]) {
  const refetched = keyby(await getPages({ internalIds: pages.filter(isNotNull).map(p => p.internalId), deleteStates: DeleteStateAll }, db), 'internalId')
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

export async function createVersionedPage (versionedService: VersionedService, userId: string, data: PageData & { legacyId?: string }, db: Queryable, extra?: CreatePageExtras) {
  const indexes = getPageIndexes(data)
  const createdBy = data.legacyId ? (extra?.createdBy || extra?.modifiedBy || userId) : userId // || is intended - to catch blanks
  const createdAt = data.legacyId ? (extra?.createdAt ?? extra?.modifiedAt ?? undefined) : undefined
  const modifiedBy = data.legacyId ? (extra?.modifiedBy || createdBy || userId) : userId // || is intended - to catch blanks
  const modifiedAt = data.legacyId ? (extra?.modifiedAt ?? extra?.createdAt ?? undefined) : undefined
  const dataId = await versionedService.create('page', data, indexes, createdBy, db)
  await versionedService.setStamps(dataId, { createdAt: createdAt ? new Date(createdAt) : undefined, modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined, modifiedBy: modifiedBy !== userId ? modifiedBy : undefined }, db)
  if (data.legacyId && extra?.publishedAt) await versionedService.tag(dataId, 'published', undefined, extra?.publishedBy || extra?.modifiedBy || extra?.createdBy || userId, new Date(extra.publishedAt), db)
  return dataId
}

export async function createPage (versionedService: VersionedService, userId: string, parent: Page, aboveTarget: Page | undefined, name: string, data: PageData & { legacyId?: string }, extra?: CreatePageExtras) {
  let linkId = extra?.linkId ?? nanoid(10)
  return await db.transaction(async db => {
    [parent, aboveTarget] = await refetch(db, parent, aboveTarget)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }
    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget)
    const dataId = await createVersionedPage(versionedService, userId, data, db, extra)
    async function insert () {
      const newInternalId = await db.insert(`
        INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId, siteId, title, templateKey)
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [name, `/${[...parent.pathSplit, parent.internalId].join('/')}`, displayOrder, parent.pagetreeId, dataId, linkId, parent.siteInternalId, data.title, data.templateKey])
      // return the newly created page
      return new Page(await db.getrow('SELECT * FROM pages WHERE id=?', [newInternalId]))
    }
    try {
      return await insert()
    } catch (e: any) {
      if (e.code !== 1062) throw e
      // if we got a duplicate key error, try again with a new linkId
      linkId = nanoid(10)
      return await insert()
    }
  }, { retries: 2 })
}

export async function movePages (pages: Page[], parent: Page, aboveTarget?: Page) {
  return await db.transaction(async db => {
    // refetch pages inside transaction for safety
    [parent, aboveTarget, ...pages] = await refetch(db, parent, aboveTarget, ...pages)
    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }

    if (pages.some(page => parent.id === page.id || parent.path.startsWith(page.pathAsParent + '/'))) {
      throw new Error('Cannot move a page into its own subtree.')
    }

    // We cannot allow pages to be moved between pagetrees because linkId collision could occur.
    // linkId collision can also occur on a copy, but in that case we can generate a new linkId
    // automatically and the operation can still be undone. For instance, if you move a page to
    // a new pagetree and give it a new linkId in the process, but that move was a mistake, lots
    // of links will break and there's no way to restore them. Also, moving a page always moves
    // all of its subpages, so the problem would be multiplied by the number of descendants.
    if (pages.some(page => parent.pagetreeId !== page.pagetreeId)) {
      throw new Error('Moving between sites or pagetrees is not allowed. Copy instead.')
    }

    // If page selected to be moved is a descendent of one of the other pages being moved,
    // we don't need to move it because it will be moved with its ancestor
    let filteredPages = pages.filter(page => !pages.some(p => page.path === p.pathAsParent || page.path.startsWith(p.pathAsParent + '/')))
    filteredPages = sortby(filteredPages, 'displayOrder')

    // numerate page names as required
    let binds: (string | number)[] = [parent.path + '/' + String(parent.internalId)]
    const usednames = new Set<string>(await db.getvals(`SELECT name FROM pages WHERE path=? AND id NOT IN (${db.in(binds, filteredPages.map(p => p.internalId))})`, binds))
    const newnames = new Map<string, string>()
    for (const p of filteredPages) {
      let newname = p.name
      while (usednames.has(newname)) newname = numerate(newname)
      newnames.set(p.id, newname)
      usednames.add(newname)
    }

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
      const descendants = (await db.getall('SELECT * FROM pages WHERE id=? OR path LIKE ?', [p.internalId, p.pathAsParent + '%'])).map(r => new Page(r))
      const pathsize = p.pathSplit.length
      for (const d of descendants) {
        const newPath = `/${[...parent.pathSplit, parent.internalId, ...d.pathSplit.slice(pathsize)].join('/')}`
        await db.update('UPDATE pages SET name=?, path=? WHERE id=?', [newnames.get(d.id) ?? d.name, newPath, d.internalId])
      }
    }

    // return the newly updated pages
    binds = []
    const updatedPages = await db.getall(`SELECT * FROM pages WHERE id IN (${db.in(binds, filteredPages.map(p => p.internalId))})`, binds)
    return updatedPages.map(p => new Page(p))
  })
}

async function handleCopy (db: Queryable, versionedService: VersionedService, userId: string, page: Page, parent: Page, displayOrder: number, includeChildren?: boolean) {
  const pageData = await versionedService.get<PageData>(page.dataId)
  delete pageData!.data.legacyId
  const pageIndexes = await versionedService.getIndexes(page.dataId, pageData!.version)
  const newDataId = await versionedService.create('page', pageData!.data, pageIndexes, userId, db)
  let newPageName = page.name
  const pagesWithName = new Set(await db.getvals<string>('SELECT name FROM pages WHERE name LIKE ? AND path = ?', [`${String(page.name)}%`, parent.pathAsParent]))
  while (pagesWithName.has(newPageName)) newPageName = numerate(newPageName)

  // only generate a new linkId when copying within a pagetree or when the target pagetree has
  // the linkId already, otherwise re-use it so copying pages into a sandbox will maintain links
  const newLinkId = page.pagetreeId === parent.pagetreeId || await db.getval('SELECT linkId FROM pages WHERE pagetreeId=?', [parent.pagetreeId]) ? nanoid(10) : page.linkId
  const newInternalId = await db.insert(`
    INSERT INTO pages (name, pagetreeId, dataId, linkId, path, displayOrder, siteId, title, templateKey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newPageName, parent.pagetreeId, newDataId, newLinkId, parent.pathAsParent, displayOrder, parent.siteInternalId, pageData!.data.title, pageData!.data.templateKey])
  if (includeChildren) {
    const children = (await db.getall('SELECT * FROM pages WHERE path = ?', [page.pathAsParent])).map(r => new Page(r))
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

export async function deletePages (versionedService: VersionedService, pages: Page[], userInternalId: number) {
  return await db.transaction(async db => {
    const binds: (string | number)[] = [userInternalId, DeleteState.MARKEDFORDELETE]
    const refetchedPages = await refetch(db, ...pages)
    const pageInternalIds = refetchedPages.map(p => p.internalId)
    const children = await getPages({ deleteStates: DeleteStateAll, internalIdPathsRecursive: refetchedPages.map(page => `${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`) }, db)
    const childInternalIds = children.map(c => c.internalId)
    const pageIds = [...refetchedPages.map(p => p.dataId), ...children.map(p => p.dataId)]
    await versionedService.removeTags(pageIds, ['published'], db)
    await db.update(`UPDATE pages SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id IN (${db.in(binds, unique([...pageInternalIds, ...childInternalIds]))})`, binds)
  })
}

export async function publishPageDeletions (pages: Page[], userInternalId: number) {
  const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
  return await db.transaction(async db => {
    const binds: (string | number)[] = [userInternalId, DeleteState.DELETED]
    const refetchedPages = await refetch(db, ...pages)
    const pageInternalIds = refetchedPages.map(p => p.internalId)
    const children = await getPages({ deleteStates: DeleteStateAll, internalIdPathsRecursive: refetchedPages.map(page => `${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`) }, db)
    const childInternalIds = children.map(c => c.internalId)
    await db.update(`UPDATE pages SET deletedAt = NOW(), deletedBy = ?, deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE id IN (${db.in(binds, unique([...pageInternalIds, ...childInternalIds]))})`, binds)
  })
}

export async function undeletePages (pages: Page[]) {
  return await db.transaction(async db => {
    let binds: (string | number)[] = []
    const refetchedPages = await refetch(db, ...pages)
    const deletedParents = await db.getall(`SELECT id FROM pages WHERE deleteState != ${DeleteState.NOTDELETED} AND id NOT IN (${db.in(binds, refetchedPages.map(rp => rp.internalId))}) AND id IN (${db.in(binds, refetchedPages.map(rp => rp.parentInternalId).filter(isNotNull))})`, binds)
    if (deletedParents.length) throw new Error('Cannot undelete a page with a deleted parent.')
    binds = [DeleteState.NOTDELETED]
    await db.update(`
      UPDATE pages p
      SET deletedAt = NULL, deletedBy = NULL, deleteState = ?
      WHERE id IN (${db.in(binds, refetchedPages.map(p => p.internalId))})`, binds)
  })
}

export async function renamePage (page: Page, name: string) {
  return await db.update('UPDATE pages SET name = ? WHERE id = ?', [name, page.internalId])
}
