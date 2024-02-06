/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import db from 'mysql2-async/db'
import { type Queryable } from 'mysql2-async'
import { nanoid } from 'nanoid'
import { isNotBlank, isNotNull, keyby, unique, sortby, clone } from 'txstate-utils'
import { Page, type PageFilter, type VersionedService, normalizePath, getPageIndexes, DeleteState, numerate, DeleteStateAll, DeleteStateInput, DeleteStateDefault, systemContext, migratePage, collectComponents, templateRegistry, appendPath, shiftPath, PagetreeType, LaunchState, searchCodes, splitWords, quadgrams, normalizeForSearch } from '../internal.js'
import { type PageData } from '@dosgato/templating'
import { DateTime } from 'luxon'
import { stemmer } from 'stemmer'
import { doubleMetaphone } from 'double-metaphone'

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

async function convertPathsToIDPaths (pathstrings: string[], tdb: Queryable = db) {
  const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
  const names = new Set<string>(paths.flat())
  const binds: string[] = []
  const rows = names.size ? await tdb.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM pages WHERE name IN (${db.in(binds, Array.from(names))})`, binds) : []
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

async function processFilters (filter?: PageFilter, tdb: Queryable = db) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'pages',
    new Map(),
    ' AND sites.deletedAt IS NULL AND pagetrees.deletedAt IS NULL',
    ' AND (sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL)'
  )
  let searchweights: Record<string, number> | undefined

  if (filter == null) return { binds, joins, where, searchweights }

  // live
  if (filter.live) {
    filter.published = true
    if (filter.pagetreeTypes?.length && !filter.pagetreeTypes.some(t => t === PagetreeType.PRIMARY)) filter.noresults = true
    else filter.pagetreeTypes = [PagetreeType.PRIMARY]
    if (filter.launchStates?.length && !filter.launchStates.some(t => t === LaunchState.LAUNCHED)) filter.noresults = true
    else filter.launchStates = [LaunchState.LAUNCHED]
  }

  // launchStates
  if (filter.launchStates?.length) {
    where.push(`sites.launchEnabled IN (${db.in(binds, filter.launchStates)})`)
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
  }

  // siteIds
  if (filter.siteIds?.length) {
    where.push(`pagetrees.siteId IN (${db.in(binds, filter.siteIds)})`)
  }

  // maxDepth
  if (filter.maxDepth === 0) {
    where.push('pages.path = "/"')
  } else if (filter.maxDepth != null) {
    where.push('LENGTH(pages.path) - LENGTH(REPLACE(pages.path, "/", "")) <= ?')
    binds.push(filter.maxDepth)
  }

  // published
  if (filter.published) {
    where.push('tags.tag IS NOT NULL')
  }

  await Promise.all([
    (async () => {
      // named paths e.g. /site1/about
      if (filter.paths?.length) {
        const idpaths = await convertPathsToIDPaths(filter.paths, tdb)
        const ids = ['-1', ...idpaths.map(p => p.split(/\//).slice(-1)[0]).filter(isNotBlank)]
        where.push(`pages.id IN (${db.in(binds, ids)})`)
      }
    })(),
    (async () => {
      // beneath a named path e.g. /site1/about
      if (filter.beneath?.length) {
        const idpaths = await convertPathsToIDPaths(filter.beneath, tdb)
        const ors = idpaths.flatMap(p => ['pages.path LIKE ?', 'pages.path = ?'])
        if (ors.length) {
          binds.push(...idpaths.flatMap(p => [`${p}/%`, p]))
          where.push(ors.join(' OR '))
        } else filter.noresults = true
      }
    })(),
    (async () => {
      // direct children of a named path e.g. /site1/about
      if (filter.parentPaths?.length) {
        const idpaths = await convertPathsToIDPaths(filter.parentPaths, tdb)
        where.push(`pages.path IN (${db.in(binds, ['-1', ...idpaths])})`)
      }
    })()
  ])

  // search query - goes last so it can re-use all the previous filters
  if (filter.search?.length) {
    const lcSearch = normalizeForSearch(filter.search)
    const words = splitWords(lcSearch)
    const codes = words.flatMap(searchCodes)
    if (!codes.length) {
      filter.noresults = true
    } else {
      const wordlikes: string[] = []
      const wordbinds: string[] = []
      const grams = words.flatMap(quadgrams)
      if (grams.length) {
        for (const w of words) {
          wordlikes.push('pages.name LIKE ? OR pages.title LIKE ?')
          wordbinds.push(`%${w}%`, `%${w}%`)
        }
      }
      const ibinds: any[] = []
      const query = `
        SELECT pages.id, pages.name, pages.title, COUNT(*) as cnt FROM pages
        INNER JOIN pages_searchcodes psc ON pages.id=psc.pageId
        INNER JOIN searchcodes sc ON sc.id=psc.codeId
        INNER JOIN pagetrees ON pagetrees.id=pages.pagetreeId
        INNER JOIN sites ON sites.id=pagetrees.siteId
        LEFT JOIN tags ON tags.id = pages.dataId AND tags.tag = 'published'
        ${joins.size ? Array.from(joins.values()).join('\n') : ''}
        WHERE
        ${where.length ? '(' + where.join(') AND (') + ')' : ''}
        AND (
          sc.searchcode IN (${db.in(ibinds, codes)})
          ${grams.length ? `OR (sc.searchcode IN (${db.in(ibinds, grams)}) AND (${wordlikes.join(') AND (')}))` : ''}
        )
        GROUP BY pages.id
        ORDER BY cnt DESC, pages.path, pages.name
        LIMIT 100
      `
      const rows = await db.getall<{ id: string, name: string, title: string, cnt: number }>(query, [...binds, ...ibinds, ...wordbinds])
      if (!rows.length) filter.noresults = true
      else {
        where.push(`pages.id IN (${db.in(binds, rows.map(r => r.id))})`)
        searchweights = rows.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.cnt + (curr.name.includes(lcSearch) || curr.title.normalize('NFKD').toLocaleLowerCase().includes(lcSearch) ? 100 : 0) }), {})
      }
    }
  }

  // pages, assets, data referenced TODO

  return { binds, where, joins, searchweights }
}

export async function getPages (filter: PageFilter, tdb: Queryable = db) {
  const { binds, where, joins, searchweights } = await processFilters(filter, tdb)
  if (filter.noresults) return []
  const pagerows = await tdb.getall(`
    SELECT pages.*, pagetrees.type as pagetreeType, sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL as orphaned, tags.tag IS NOT NULL as published
    FROM pages
    INNER JOIN pagetrees ON pages.pagetreeId = pagetrees.id
    INNER JOIN sites ON pages.siteId = sites.id
    LEFT JOIN tags ON tags.id = pages.dataId AND tags.tag = 'published'
    ${joins.size ? Array.from(joins.values()).join('\n') : ''}
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
    ORDER BY pages.\`path\`, pages.displayOrder, pages.name`, binds)
  const pages = pagerows.map(p => new Page(p))
  const ancestorIds = new Set<number>()
  for (const p of pages) {
    for (const id of p.pathSplit) ancestorIds.add(id)
  }
  const abinds: number[] = []
  const ancestorrows = ancestorIds.size ? await tdb.getall<{ id: number, name: string }>(`SELECT id, name FROM pages WHERE id IN (${db.in(abinds, Array.from(ancestorIds))})`, abinds) : []
  const namesById = keyby(ancestorrows, 'id')
  for (const p of pages) {
    p.resolvedPath = `/${p.pathSplit.map(id => namesById[id].name).join('/')}${p.pathSplit.length ? '/' : ''}${p.name}`
    p.resolvedPathWithoutSitename = shiftPath(p.resolvedPath)
  }
  if (searchweights) return sortby(pages, p => searchweights[p.internalId], true, 'path', 'displayOrder')
  return pages
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
  return await db.transaction(async db => {
    return await createPageInTransaction(db, versionedService, userId, parent, aboveTarget, name, data, extra)
  }, { retries: 2 })
}

export async function createPageInTransaction (db: Queryable, versionedService: VersionedService, userId: string, parent: Page, aboveTarget: Page | undefined, name: string, data: PageData & { legacyId?: string }, extra?: CreatePageExtras) {
  let linkId = extra?.linkId ?? nanoid(10)
  ;[parent, aboveTarget] = await refetch(db, parent, aboveTarget)
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
    await setPageSearchCodes({ internalId: newInternalId, name, title: data.title }, db)
    return newInternalId
  }
  try {
    return await insert()
  } catch (e: any) {
    if (e.code !== 1062) throw e
    // if we got a duplicate key error, try again with a new linkId
    linkId = nanoid(10)
    return await insert()
  }
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
    const binds: (string | number)[] = [parent.path + '/' + String(parent.internalId)]
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
      const descendants = await db.getall<{ id: string, name: string, internalId: number, path: string }>('SELECT dataId as id, name, id as internalId, path FROM pages WHERE id=? OR path LIKE ?', [p.internalId, p.pathAsParent + '%'])
      const pathsize = p.pathSplit.length
      for (const d of descendants) {
        const dpathSplit = d.path.split(/\//).filter(isNotBlank)
        const newPath = `/${[...parent.pathSplit, parent.internalId, ...dpathSplit.slice(pathsize)].join('/')}`
        await db.update('UPDATE pages SET name=?, path=? WHERE id=?', [newnames.get(d.id) ?? d.name, newPath, d.internalId])
      }
    }

    // return the newly updated pages
    return filteredPages.map(p => p.internalId)
  })
}

async function handleCopy (db: Queryable, versionedService: VersionedService, userId: string, page: Page, parent: Page, parentPath: string, displayOrder: number, includeChildren?: boolean) {
  let newPageName = page.name
  const pagesWithName = new Set(await db.getvals<string>('SELECT name FROM pages WHERE name LIKE ? AND path = ?', [`${String(page.name)}%`, parent.pathAsParent]))
  while (pagesWithName.has(newPageName)) newPageName = numerate(newPageName)
  const newPagePath = appendPath(parentPath, newPageName)

  const pageData = await versionedService.get<PageData>(page.intDataId)
  if (!pageData) throw new Error('Tried to copy a page with corrupted data.')
  delete pageData.data.legacyId
  const extras = {
    query: systemContext().query,
    siteId: page.siteId,
    pagetreeId: page.pagetreeId,
    parentId: parent.id,
    pagePath: newPagePath,
    name: newPageName
  }
  const migrated = await migratePage(pageData.data, extras)
  const components = collectComponents(migrated)
  const workspace = {}
  for (const c of components) templateRegistry.getPageOrComponentTemplate(c.templateKey)?.onCopy?.(c, true, workspace)
  const pageIndexes = getPageIndexes(migrated)
  const newDataId = await versionedService.create('page', migrated, pageIndexes, userId, db)

  // only generate a new linkId when copying within a pagetree or when the target pagetree has
  // the linkId already, otherwise re-use it so copying pages into a sandbox will maintain links
  const newLinkId = page.pagetreeId === parent.pagetreeId || await db.getval('SELECT linkId FROM pages WHERE linkId=? AND pagetreeId=?', [page.linkId, parent.pagetreeId]) ? nanoid(10) : page.linkId
  const newInternalId = await db.insert(`
    INSERT INTO pages (name, pagetreeId, dataId, linkId, path, displayOrder, siteId, title, templateKey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newPageName, parent.pagetreeId, newDataId, newLinkId, parent.pathAsParent, displayOrder, parent.siteInternalId, migrated.title, migrated.templateKey])
  await setPageSearchCodes({ internalId: newInternalId, name: newPageName, title: migrated.title }, db)
  if (includeChildren) {
    const children = await getPages({ internalIdPaths: [page.pathAsParent], deleteStates: [DeleteStateInput.NOTDELETED] }, db)
    const newParent = (await getPages({ internalIds: [newInternalId] }, db))[0]
    for (const child of children) {
      await handleCopy(db, versionedService, userId, child, newParent, newPagePath, child.displayOrder, true)
    }
  }
  return newDataId
}

export async function copyPages (versionedService: VersionedService, userId: string, pages: Page[], parent: Page, aboveTarget?: Page, includeChildren?: boolean) {
  return await db.transaction(async db => {
    [parent, aboveTarget, ...pages] = await refetch(db, parent, aboveTarget, ...pages)
    let parentPath = '/'
    if (parent.pathSplit.length) {
      const binds: any[] = []
      const ancestors = await db.getall(`SELECT id, name FROM pages WHERE id IN (${db.in(binds, parent.pathSplit)})`, binds)
      const ancestorsById = keyby(ancestors, 'id')
      parentPath = '/' + parent.pathSplit.map(id => ancestorsById[id].name).join('/')
    }

    if (aboveTarget && parent.internalId !== aboveTarget.parentInternalId) {
      throw new Error('Page targeted for ordering above no longer belongs to the same parent it did when the mutation started.')
    }

    pages = sortby(pages, 'displayOrder')

    const displayOrder = await handleDisplayOrder(db, parent, aboveTarget, pages.length)

    let i = 0
    for (const page of pages) {
      await handleCopy(db, versionedService, userId, page, parent, parentPath, displayOrder + i, includeChildren)
      i++
    }
    return parent
  })
}

export async function deletePages (versionedService: VersionedService, pages: Page[], userInternalId: number) {
  await db.transaction(async db => {
    const binds: (string | number)[] = [userInternalId, DeleteState.MARKEDFORDELETE]
    const refetchedPages = await refetch(db, ...pages)
    const pageInternalIds = refetchedPages.map(p => p.internalId)
    const children = await getPages({ deleteStates: DeleteStateAll, internalIdPathsRecursive: refetchedPages.map(page => `${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`) }, db)
    const childInternalIds = children.map(c => c.internalId)
    const pageIds = [...refetchedPages.map(p => p.intDataId), ...children.map(p => p.intDataId)]
    await versionedService.removeTags(pageIds, ['published'], db)
    await db.update(`UPDATE pages SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id IN (${db.in(binds, unique([...pageInternalIds, ...childInternalIds]))})`, binds)
  })
}

export async function publishPageDeletions (pages: Page[], userInternalId: number) {
  const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
  await db.transaction(async db => {
    const binds: (string | number)[] = [userInternalId, DeleteState.DELETED]
    const refetchedPages = await refetch(db, ...pages)
    const pageInternalIds = refetchedPages.map(p => p.internalId)
    const children = await getPages({ deleteStates: DeleteStateAll, internalIdPathsRecursive: refetchedPages.map(page => `${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`) }, db)
    const childInternalIds = children.map(c => c.internalId)
    async function update () {
      await db.update(`UPDATE pages SET linkId=LEFT(MD5(RAND()), 10), deletedAt = NOW(), deletedBy = ?, deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE id IN (${db.in(binds, unique([...pageInternalIds, ...childInternalIds]))})`, binds)
    }
    try {
      await update()
    } catch (e: any) {
      if (e.code !== 1062) throw e
      // if we got a duplicate key error, try again and it will generate new linkIds
      await update()
    }
  })
}

export async function undeletePages (pages: Page[]) {
  await db.transaction(async db => {
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
  return await db.transaction(async db => {
    const rows = await db.update('UPDATE pages SET name = ? WHERE id = ?', [name, page.internalId])
    if (rows > 0) await setPageSearchCodes({ internalId: page.internalId, title: page.title, name }, db)
    return rows
  })
}

export async function ensureSearchCodes (searchcodes: string[], db: Queryable) {
  if (searchcodes.length) {
    let binds: any[] = []
    const existing = await db.getall<{ id: number, searchcode: string }>(`SELECT id, searchcode FROM searchcodes WHERE searchcode IN (${db.in(binds, searchcodes)})`, binds)
    const existingByCode = keyby(existing, 'searchcode')
    const newcodes = searchcodes.filter(c => !existingByCode[c])
    binds = []
    if (newcodes.length) await db.insert(`INSERT INTO searchcodes (searchcode) VALUES ${db.in(binds, newcodes.map(c => [c]))} ON DUPLICATE KEY UPDATE searchcode=searchcode`, binds)
    binds = []
    const codes = await db.getall<{ id: number, searchcode: string }>(`SELECT id, searchcode FROM searchcodes WHERE searchcode IN (${db.in(binds, searchcodes)}) LOCK IN SHARE MODE`, binds)
    const codeToId = keyby(codes, 'searchcode')
    return searchcodes.map(c => codeToId[c].id)
  }
  return []
}

export async function setPageSearchCodes (page: { internalId: number, name: string, title: string }, db: Queryable) {
  const searchcodes = Array.from(new Set([page.name, normalizeForSearch(page.title)].flatMap(splitWords).flatMap(w => [...searchCodes(w), ...quadgrams(w)])))
  const codeIds = await ensureSearchCodes(searchcodes, db)
  if (codeIds.length) {
    let binds = [page.internalId]
    await db.delete(`DELETE FROM pages_searchcodes WHERE pageId=? AND codeId NOT IN (${db.in(binds, codeIds)})`, binds)
    binds = []
    await db.insert(`INSERT INTO pages_searchcodes (pageId, codeId) VALUES ${db.in(binds, codeIds.map(id => [page.internalId, id]))} ON DUPLICATE KEY UPDATE codeId=codeId`, binds)
  } else {
    await db.delete('DELETE FROM pages_searchcodes WHERE pageId=?', [page.internalId])
  }
}

export async function cleanSearchCodes () {
  await db.delete('DELETE sc FROM searchcodes sc LEFT JOIN pages_searchcodes psc ON psc.codeId=sc.id WHERE psc.codeId IS NULL')
}
