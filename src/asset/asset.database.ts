import { type Context } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { intersect, isBlank, isNotBlank, isNotNull, keyby, pick, stringify } from 'txstate-utils'
import {
  Asset, type AssetFilter, AssetResize, type VersionedService, AssetFolder, fileHandler, DownloadRecord,
  type DownloadsFilter, DownloadsResolution, type AssetFolderRow, DeleteState, processDeletedFilters,
  normalizePath, AssetServiceInternal, numerate, NameConflictError, templateRegistry, processLink,
  singleValueIndexesToIndexes, parseLinks, shiftPath
} from '../internal.js'
import { extractLinksFromText } from '@dosgato/templating'

export interface AssetInput {
  name: string
  filename: string
  checksum: string
  mime: string
  size: number
  width?: number
  height?: number
  modifiedBy?: string
  modifiedAt?: string
  meta?: any
}

export interface CreateAssetInput extends AssetInput {
  folderId: string
  legacyId?: string
  createdBy?: string
  createdAt?: string
  linkId?: string
  uploadedFilename?: string
}

export interface ReplaceAssetInput extends AssetInput {
  assetId: string
}

export interface AssetRow {
  id: number
  name: string
  folderId: number
  dataId: number
  linkId: string
  shasum: string
  deletedAt?: Date
}

export interface AssetRowWithPagetreeId extends AssetRow {
  pagetreeId: number
}

async function convertPathsToIDPaths (pathstrings: string[], tdb: Queryable = db) {
  const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
  const potentialFolderNames = new Set<string>(paths.flat())
  const potentialAssetNames = new Set<string>(paths.map(p => p[p.length - 1]))
  const folderBinds: string[] = []
  const assetBinds: string[] = []
  const [folderRows, assetRows] = await Promise.all([
    potentialFolderNames.size ? tdb.getall<{ id: number, name: string, path: string }>(`SELECT id, name, path FROM assetfolders WHERE name IN (${db.in(folderBinds, Array.from(potentialFolderNames))})`, folderBinds) : [],
    potentialAssetNames.size ? tdb.getall<{ id: number, name: string, folderId: number }>(`SELECT id, name, folderId FROM assets WHERE name IN (${db.in(assetBinds, Array.from(potentialAssetNames))})`, assetBinds) : []
  ])
  const foldersByNameAndIDPath: Record<string, Record<string, typeof folderRows[number]>> = {}
  for (const row of folderRows) {
    foldersByNameAndIDPath[row.name] ??= {}
    foldersByNameAndIDPath[row.name][row.path] = row
  }
  const assetsByNameAndFolderId: Record<string, Record<string, typeof assetRows[number]>> = {}
  for (const row of assetRows) {
    assetsByNameAndFolderId[row.name.toLowerCase()] ??= {}
    assetsByNameAndFolderId[row.name.toLowerCase()][row.folderId] = row
  }
  const ret: { folderIdPath?: string, assetId?: number }[] = []
  for (const entry of paths) {
    let lastpath = '/'
    let lastFolderId: number | undefined
    let assetId: number | undefined
    let folderIdPath: string | undefined
    for (let i = 0; i < entry.length; i++) {
      const segment = entry[i]
      const folder = foldersByNameAndIDPath[segment]?.[lastpath]
      if (!folder) {
        if (i === entry.length - 1) {
          assetId = assetsByNameAndFolderId[segment]?.[lastFolderId!]?.id
        }
        break
      } else {
        lastFolderId = folder.id
      }
      lastpath = `${folder.path}${folder.path === '/' ? '' : '/'}${folder.id}`
      if (i === entry.length - 1) folderIdPath = lastpath
    }
    if (folderIdPath || assetId) ret.push({ folderIdPath, assetId })
  }
  return ret
}

async function processFilters (filter?: AssetFilter, tdb: Queryable = db) {
  const { binds, where, joins } = processDeletedFilters(
    filter,
    'assets',
    new Map([]),
    ' AND sites.deletedAt IS NULL AND pagetrees.deletedAt IS NULL',
    ' AND (sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL)'
  )

  if (filter == null) return { binds, joins, where }

  if (filter.internalIds?.length) {
    where.push(`assets.id IN (${db.in(binds, filter.internalIds)})`)
  }
  if (filter.ids?.length) {
    where.push(`assets.dataId IN (${db.in(binds, filter.ids)})`)
  }
  if (filter.linkIds?.length) {
    where.push(`assets.linkId IN (${db.in(binds, filter.linkIds)})`)
  }
  await Promise.all([
    (async () => {
      // named paths e.g. /site1/about
      if (filter.paths?.length) {
        const idpaths = await convertPathsToIDPaths(filter.paths, tdb)
        const ids = ['-1', ...idpaths.map(p => p.assetId).filter(isNotNull)]
        where.push(`assets.id IN (${db.in(binds, ids)})`)
      }
    })(),
    (async () => {
      // beneath a named path e.g. /site1/about
      if (filter.beneath?.length) {
        const idpaths = (await convertPathsToIDPaths(filter.beneath, tdb)).filter(p => p.folderIdPath)
        if (idpaths.length) {
          const mybinds: any[] = []
          const ors = idpaths.flatMap(p => ['assetfolders.path LIKE ?', 'assetfolders.path = ?'])
          mybinds.push(...idpaths.flatMap(p => [`${p.folderIdPath!}/%`, p.folderIdPath]))
          const subFolderIds = await tdb.getvals<number>(`SELECT id FROM assetfolders WHERE ${ors.join(' OR ')}`, mybinds)
          filter.folderIds = intersect({ skipEmpty: true }, ['-1', ...idpaths.map(p => p.folderIdPath!.split(/\//).slice(-1)[0]), ...subFolderIds.map(String)], filter.folderIds)
        } else {
          filter.folderIds = ['-1']
        }
      }
    })(),
    (async () => {
      // direct children of a named path e.g. /site1/about
      if (filter.parentPaths?.length) {
        const idpaths = (await convertPathsToIDPaths(filter.parentPaths, tdb)).filter(p => p.folderIdPath)
        where.push(`assets.folderId IN (${db.in(binds, ['-1', ...idpaths.map(p => p.folderIdPath!.split(/\//).slice(-1)[0]).filter(isNotBlank)])})`)
      }
    })()
  ])
  if (filter.folderIds?.length) {
    where.push(`assetfolders.id IN (${db.in(binds, filter.folderIds)})`)
  }
  if (filter.pagetreeIds?.length) {
    where.push(`assetfolders.pagetreeId IN (${db.in(binds, filter.pagetreeIds)})`)
  }
  if (filter.pagetreeTypes?.length) {
    where.push(`pagetrees.type IN (${db.in(binds, filter.pagetreeTypes)})`)
  }
  if (filter.launchStates?.length) {
    where.push(`sites.launchEnabled IN (${db.in(binds, filter.launchStates)})`)
  }
  if (filter.folderInternalIds?.length) {
    where.push(`assets.folderId IN (${db.in(binds, filter.folderInternalIds)})`)
  }
  if (filter.siteIds?.length) {
    where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
  }
  if (filter.names?.length) {
    where.push(`assets.name IN (${db.in(binds, filter.names)})`)
  }
  if (filter.checksums?.length) {
    where.push(`binaries.shasum IN (${db.in(binds, filter.checksums)})`)
  }
  if (filter.bytes != null) {
    if (filter.bytes < 0) where.push('binaries.bytes < ?')
    else where.push('binaries.bytes > ?')
    binds.push(Math.abs(filter.bytes))
  }
  return { binds, where, joins }
}

export async function getAssets (filter?: AssetFilter, tdb: Queryable = db) {
  const { binds, where, joins } = await processFilters(filter, tdb)
  const assetrows = await tdb.getall(`
    SELECT assets.id, assets.dataId, assets.name, assets.linkId, assets.folderId, assets.deletedAt, assets.deletedBy, assets.deleteState,
    binaries.bytes AS filesize, binaries.mime, binaries.shasum, binaries.meta,
    sites.deletedAt IS NOT NULL OR pagetrees.deletedAt IS NOT NULL as orphaned,
    pagetrees.type as pagetreeType, assetfolders.siteId, assetfolders.pagetreeId, assetfolders.path,
    sites.launchEnabled
    FROM assets
    INNER JOIN binaries on assets.shasum = binaries.shasum
    INNER JOIN assetfolders ON assets.folderId = assetfolders.id
    INNER JOIN pagetrees ON assetfolders.pagetreeId = pagetrees.id
    INNER JOIN sites ON assetfolders.siteId = sites.id
    ${joins.size ? Array.from(joins.values()).join('\n') : ''}
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}
    ORDER BY assets.name
  `, binds)
  const assets = assetrows.map(a => new Asset(a))
  const ancestorIds = new Set<number>()
  for (const a of assets) {
    for (const id of a.pathSplit) ancestorIds.add(id)
  }
  const abinds: number[] = []
  const ancestorrows = ancestorIds.size ? await tdb.getall<{ id: number, name: string }>(`SELECT id, name FROM assetfolders WHERE id IN (${db.in(abinds, Array.from(ancestorIds))})`, abinds) : []
  const namesById = keyby(ancestorrows, 'id')
  for (const a of assets) {
    a.resolvedPath = `/${a.pathSplit.map(id => namesById[id].name).join('/')}/${a.name as string}`
    a.resolvedPathWithoutSitename = shiftPath(a.resolvedPath)
  }
  return assets
}

export async function getAssetsByPath (paths: string[], filter: AssetFilter, ctx: Context) {
  const assets = await getAssets({ ...filter, paths })
  const ret: { key: string, value: Asset }[] = []
  await Promise.all(assets.map(async a => {
    ret.push({ key: await ctx.svc(AssetServiceInternal).getPath(a), value: a })
  }))
  return ret
}

export async function getResizes (assetInternalIds: number[]) {
  const binds: string[] = []
  const where: string[] = []
  where.push(`a.id IN (${db.in(binds, assetInternalIds)})`)
  const resizes = await db.getall(`SELECT a.id as assetId, r.*, rb.shasum, rb.bytes, rb.mime, rb.meta
  FROM resizes r
  INNER JOIN binaries b ON r.originalBinaryId = b.id
  INNER JOIN binaries rb ON r.binaryId = rb.id
  INNER JOIN assets a ON b.shasum = a.shasum
  WHERE (${where.join(') AND (')})
  ORDER BY rb.bytes`, binds)
  return resizes.map(row => ({ key: row.assetId, value: new AssetResize(row) }))
}

export async function getResizesById (resizeIds: string[]) {
  const rows = await db.getall(`SELECT r.*, rb.shasum, rb.bytes, rb.mime, rb.meta
  FROM resizes r
  INNER JOIN binaries rb ON r.binaryId = rb.id
  WHERE rb.shasum IN (${db.in([], resizeIds)})`, [resizeIds])
  return rows.map(r => new AssetResize(r))
}

export async function getLatestDownload (asset: Asset, resizeBinaryIds: number[]) {
  const binds: number[] = []
  const binaryId = await db.getval<number>(`SELECT binaries.id FROM binaries
                                  INNER JOIN assets on assets.shasum = binaries.shasum
                                  WHERE assets.id = ?`, [asset.internalId])
  if (!binaryId) throw new Error(`Could not find binary for asset ${String(asset.name)}`)
  const latestDownload = await db.getrow(`SELECT binaryId, year, month, day, CONCAT(year,month,day) AS dateconcat
                                          FROM downloads
                                          WHERE binaryId in (${db.in(binds, [binaryId, ...resizeBinaryIds])})
                                          ORDER BY dateconcat DESC
                                          LIMIT 1`, binds)

  return DateTime.fromObject({ year: latestDownload.year, month: latestDownload.month, day: latestDownload.day })
}

export function recordDownload (checksum: string) {
  const now = DateTime.local()
  db.insert(`
    INSERT INTO downloads (binaryId, year, month, day, downloads)
    SELECT binaries.id, ?, ?, ?, 1 FROM binaries WHERE binaries.shasum = ?
    ON DUPLICATE KEY UPDATE downloads = downloads + 1`, [now.year, now.month, now.day, checksum]).catch(console.error)
}

interface DownloadRow {
  relatedId: string
  year: number
  month: number
  day: number
  downloads: number
}
function processDownloadRows (rows: DownloadRow[], res = DownloadsResolution.DAILY) {
  const sum: Record<string, number> = {}
  function add (row: { resizeId?: string, dataId?: string, year: number, month: number, day: number, downloads: number }) {
    const key = `${(row.dataId ?? row.resizeId)!}.${String(row.year).padStart(4)}${String(row.month).padStart(2)}${String(row.day).padStart(2)}`
    sum[key] ??= 0
    sum[key] += row.downloads
  }
  if (res === DownloadsResolution.DAILY) {
    for (const row of rows) {
      if (row.day > 0) add(row)
      else if (row.month > 0) {
        const dt = DateTime.local(row.year, row.month, 1)
        add({ ...row, day: 1, downloads: row.downloads / dt.daysInMonth! })
      } else {
        const dt = DateTime.local(row.year, 1, 1)
        add({ ...row, month: 1, day: 1, downloads: row.downloads / dt.daysInYear })
      }
    }
  } else if (res === DownloadsResolution.WEEKLY) {
    for (const row of rows) {
      if (row.day > 0) {
        const dt = DateTime.local(row.year, row.month, row.day).startOf('week')
        add({ ...row, year: dt.year, month: dt.month, day: dt.day, downloads: row.downloads })
      } else if (row.month > 0) {
        const start = DateTime.local(row.year, row.month, 1)
        const end = start.endOf('month')
        for (let dt = start; dt < end; dt = dt.plus({ days: 1 })) {
          const week = dt.startOf('week')
          add({ ...row, year: week.year, month: week.month, day: week.day, downloads: row.downloads / start.daysInMonth! })
        }
      } else {
        const start = DateTime.local(row.year, 1, 1)
        const end = start.endOf('year')
        for (let dt = start; dt < end; dt = dt.plus({ days: 1 })) {
          const week = dt.startOf('week')
          add({ ...row, year: week.year, month: week.month, day: week.day, downloads: row.downloads / start.daysInMonth! })
        }
      }
    }
  } else if (res === DownloadsResolution.MONTHLY) {
    for (const row of rows) {
      if (row.day > 0) {
        add({ ...row, day: 1 })
      } else if (row.month > 0) {
        add({ ...row, day: 1 })
      } else {
        add({ ...row, month: 1, day: 1, downloads: row.downloads / 12 })
      }
    }
  } else {
    for (const row of rows) add({ ...row, month: 1, day: 1 })
  }
  return Object.entries(sum).map(([k, v]) => {
    const [id, datestr] = k.split('.')
    return new DownloadRecord(id, datestr, v)
  })
}

export async function getDownloads (assetIds: string[], filter?: DownloadsFilter) {
  const binds: string[] = []
  const rows = await db.getall<DownloadRow>(`
    SELECT a.dataId as relatedId, d.year, d.month, d.day, SUM(d.downloads) as downloads
    FROM assets a
    INNER JOIN binaries b ON b.shasum=a.shasum
    LEFT JOIN resizes r ON r.originalBinaryId=b.id
    INNER JOIN downloads d ON d.binaryId=b.id OR d.binaryId=r.binaryId
    WHERE a.dataId IN (${db.in(binds, assetIds)})
    GROUP BY a.dataId, d.year, d.month, d.day
  `, binds)
  return processDownloadRows(rows, filter?.resolution)
}

export async function getResizeDownloads (resizeIds: string[], filter?: DownloadsFilter) {
  const binds: (string | number)[] = []
  const where = [`r.id IN (${db.in(binds, resizeIds)})`]
  if (filter?.months) {
    const ago = DateTime.local().minus({ months: filter.months })
    filter.after = filter.after && filter.after > ago ? filter.after : ago
  }
  if (filter?.after) {
    where.push('d.year > ? OR (d.year=? AND d.month > ?) OR (d.year=? AND d.month=? AND d.day > ?)')
    binds.push(filter.after.year, filter.after.year, filter.after.month, filter.after.year, filter.after.month, filter.after.day)
  }
  const rows = await db.getall<DownloadRow>(`
    SELECT r.id as relatedId, d.year, d.month, d.day, d.downloads
    FROM resizes r
    INNER JOIN downloads d ON d.binaryId=r.binaryId
    WHERE (${where.join(') AND (')})
  `, binds)
  return processDownloadRows(rows, filter?.resolution)
}

export async function compressDownloads () {
  try {
    const monthly = DateTime.local().minus({ years: 5 })
    const daily = DateTime.local().minus({ months: 6 })
    await db.transaction(async db => {
      await db.insert(`
        INSERT INTO downloads (binaryId, year, month, day, downloads)
        SELECT binaryId, year, month, 0, SUM(downloads)
        FROM downloads
        WHERE day > 0
        AND (year < :dailyYear OR (year=:dailyYear AND month < :dailyMonth))
        GROUP BY binaryId, year, month
        `, { dailyYear: daily.year, dailyMonth: daily.month })
      await db.delete(`
        DELETE FROM downloads
        WHERE day > 0
        AND (year < :dailyYear OR (year=:dailyYear AND month < :dailyMonth))
      `, { dailyYear: daily.year, dailyMonth: daily.month })
      await db.insert(`
        INSERT INTO downloads (binaryId, year, month, day, downloads)
        SELECT binaryId, year, 0, 0, SUM(downloads)
        FROM downloads
        WHERE month > 0 AND year < :monthlyYear
        GROUP BY binaryId, year
      `, { monthlyYear: monthly.year })
      await db.delete(`
        DELETE FROM downloads
        WHERE month > 0 AND year < :monthlyYear
      `, { monthlyYear: monthly.year })
    })
  } catch (e) {
    // just don't crash the container
    console.error(e)
  }
}

export function getIndexes (data: any) {
  const indexes = data.legacyId ? [{ name: 'legacyId', value: data.legacyId }] : []
  const texts = templateRegistry.serverConfig.assetMeta?.getFulltext?.(data)?.filter(isNotBlank) ?? []
  const links = parseLinks(templateRegistry.serverConfig.assetMeta?.getLinks?.(data)).flatMap(processLink)
  const moreLinks = texts.flatMap(extractLinksFromText).flatMap(processLink)

  return singleValueIndexesToIndexes(indexes.concat(links).concat(moreLinks))
}

export async function createAsset (versionedService: VersionedService, userId: string, args: CreateAssetInput, opts?: { numerate?: boolean }) {
  let linkId = args.linkId ?? nanoid(10)
  const newInternalId = await db.transaction(async db => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const createdBy = args.legacyId ? (args.createdBy || args.modifiedBy || userId) : userId // || is intended - to catch blanks
    const createdAt = args.legacyId ? (args.createdAt ?? args.modifiedAt ?? undefined) : undefined
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const modifiedBy = args.legacyId ? (args.modifiedBy || createdBy || userId) : userId // || is intended - to catch blanks
    const modifiedAt = args.legacyId ? (args.modifiedAt ?? args.createdAt ?? undefined) : undefined
    const data = { legacyId: args.legacyId, shasum: args.checksum, uploadedFilename: args.uploadedFilename ?? args.filename, meta: args.meta }
    const dataId = await versionedService.create('asset', data, getIndexes(data), createdBy, db)
    await versionedService.setStamps(dataId, { createdAt: createdAt ? new Date(createdAt) : undefined, modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined, modifiedBy: modifiedBy !== userId ? modifiedBy : undefined }, db)
    const folder = await db.getrow<{ id: number, pagetreeId: number, path: string }>('SELECT id, pagetreeId, path FROM assetfolders WHERE id = ? FOR UPDATE', [args.folderId])
    if (!folder) throw new Error('Folder to place asset in does not exist.')

    const siblingFolders = await db.getall('SELECT * FROM assetfolders WHERE path=?', [folder.path + '/' + String(folder.id), args.name])
    const siblingAssets = await db.getall('SELECT * FROM assets WHERE folderId=?', [folder.id, args.name])

    let name = args.name
    if (opts?.numerate) {
      while (isBlank(name) || siblingFolders.some(f => f.name === name) || siblingAssets.some(a => a.name === name)) name = numerate(name)
    } else if (isBlank(name) || siblingFolders.some(f => f.name === name) || siblingAssets.some(a => a.name === name)) throw new NameConflictError()

    // we can't use a UNIQUE index to enforce linkId uniqueness because we don't have the pagetreeId without joining it in
    // so we'll just do it here and expect low probability of collision within microseconds
    while (
      await db.getval<number>('SELECT COUNT(*) FROM assets INNER JOIN assetfolders ON assets.folderId=assetfolders.id WHERE assets.linkId=? AND assetfolders.pagetreeId=?', [linkId, folder.pagetreeId])
    ) linkId = nanoid(10)
    await db.insert(`
      INSERT INTO binaries (shasum, mime, meta, bytes)
      VALUES(?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime=VALUES(mime)`, [args.checksum, args.mime, stringify({ width: args.width ?? undefined, height: args.height ?? undefined }), args.size])
    return await db.insert(`
      INSERT INTO assets (name, folderId, linkId, dataId, shasum)
      VALUES(?, ?, ?, ?, ?)`, [name, folder.id, linkId, dataId, args.checksum])
  })
  return (await getAssets({ internalIds: [newInternalId] }))[0]
}

export async function replaceAsset (versionedService: VersionedService, userId: string, args: ReplaceAssetInput) {
  return await db.transaction(async db => {
    const data = await versionedService.get(Number(args.assetId))
    if (!data) throw new Error('Asset to be updated had no backing data.')
    await db.insert(`
    INSERT INTO binaries (shasum, mime, meta, bytes)
    VALUES(?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime=VALUES(mime)`, [args.checksum, args.mime, stringify(pick(args, 'width', 'height')), args.size])
    const newData = { ...data.data, shasum: args.checksum, uploadedFilename: args.filename }
    await versionedService.update(Number(args.assetId), newData, getIndexes(newData), { user: userId }, db)
    const modifiedBy = data.data.legacyId ? (args.modifiedBy ?? userId) : userId
    const modifiedAt = data.data.legacyId ? (args.modifiedAt ?? undefined) : undefined
    await versionedService.setStamps(Number(args.assetId), { modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined, modifiedBy: modifiedBy !== userId ? modifiedBy : undefined }, db)
    await db.update('UPDATE assets SET shasum=? WHERE dataId=?', [args.checksum, args.assetId])
    return (await getAssets({ ids: [args.assetId] }, db))[0]
  })
}

export async function updateAssetMeta (versionedService: VersionedService, asset: Asset, meta: any, userId: string, stamps?: { modifiedBy: string, modifiedAt: Date }) {
  const oldVersion = await versionedService.get(asset.intDataId)
  if (!oldVersion) throw new Error('Asset data missing.')
  const newData = {
      ...oldVersion.data,
      meta
  }
  await versionedService.update(asset.intDataId, newData, getIndexes(newData), { user: userId })
  if (newData.legacyId && stamps) await versionedService.setStamps(asset.intDataId, stamps, db)
}

export async function renameAsset (assetId: string, name: string, folderInternalIdPath: string) {
  const affectedRows = await db.update(`
    UPDATE assets a
    LEFT JOIN assets adupe ON a.id != adupe.id AND a.folderId=adupe.folderId AND adupe.name=?
    LEFT JOIN assetfolders fdupe ON fdupe.path=? AND fdupe.name=?
    SET a.name=?
    WHERE a.dataId=? AND adupe.id IS NULL AND fdupe.id IS NULL
  `, [name, folderInternalIdPath, name, name, assetId])
  if (affectedRows === 0) throw new Error('Rename failed, likely the name became unavailable.')
}

export async function moveAssets (targetFolder: AssetFolder, assets: Asset[], folders: AssetFolder[]) {
  await db.transaction(async db => {
    // re-pull everything inside the transaction
    const targetrow = await db.getrow<AssetFolderRow>('SELECT * FROM assetfolders WHERE id=?', [targetFolder.internalId])
    if (!targetrow) throw new Error('Target folder disappeared since the mutation began.')
    // Ensure the target folder has not moved.
    // Someone else may have moved it somewhere the current user does not have permission to create assets
    if (targetrow.path !== targetFolder.path) throw new Error('Target folder has moved since the mutation began.')

    let binds: number[] = []
    const folderrows = folders.length
      ? await db.getall<AssetFolderRow>(`SELECT * FROM assetfolders WHERE id IN (${db.in(binds, folders.map(f => f.internalId))})`, binds)
      : []

    // If any folders are moving between pagetrees, we need to error out since we don't allow that
    // See comments in movePages() for more explanation
    if (folderrows.some(f => f.pagetreeId !== targetrow.pagetreeId)) throw new Error('Moving between sites or pagetrees is not allowed. Copy instead.')

    // If folder selected to be moved is a descendent of one of the other folders being moved,
    // we don't need to move it because it will be moved with its ancestor
    const filteredFolderRows = folderrows.filter(folder => !folderrows.some(f => folder.path === makeParentPath(f) || folder.path.startsWith(makeParentPath(f) + '/')))

    binds = []
    const assetrows = assets.length
      ? await db.getall<AssetRowWithPagetreeId>(`SELECT a.*, f.pagetreeId FROM assets a INNER JOIN assetfolders f ON a.folderId=f.id WHERE a.id IN (${db.in(binds, assets.map(a => a.internalId))})`, binds)
      : []

    // If any assets are moving between pagetrees, we need to error out since we don't allow that
    // See comments in movePages() for more explanation
    if (assetrows.some(a => a.pagetreeId !== targetrow.pagetreeId)) throw new Error('Moving between sites or pagetrees is not allowed. Copy instead.')

    // If a selected asset is already in one of the folders selected, we'll skip moving it since its folder
    // is also moving. Users will potentially shift-select a big block of items including both folders and assets
    // and will not expect it all to get de-structured.
    const filteredAssetRows = assetrows.filter(asset => !folderrows.some(f => f.id === asset.folderId))

    if (filteredFolderRows.some(f => targetrow.id === f.id || targetrow.path.startsWith(makeParentPath(f) + '/'))) throw new Error('Cannot move a folder into its own sub-folder.')

    // assets are easy to move
    if (filteredAssetRows.length) {
      binds = [targetrow.id]
      await db.update(`UPDATE assets set folderId=? WHERE id IN (${db.in(binds, filteredAssetRows.map(a => a.id))})`, binds)
    }

    // correct the path column for folders and all their descendants
    for (const f of filteredFolderRows.map(f => new AssetFolder(f))) {
      const descendants = (await db.getall<AssetFolderRow>('SELECT * FROM assetfolders WHERE id=? OR path LIKE ?', [f.internalId, `/${[...f.pathSplit, f.internalId].join('/')}%`])).map(r => new AssetFolder(r))
      const pathsize = f.pathSplit.length
      for (const d of descendants) {
        const newPath = `/${[...targetFolder.pathSplit, targetFolder.internalId, ...d.pathSplit.slice(pathsize)].join('/')}`
        await db.update('UPDATE assetfolders SET path=? WHERE id=?', [newPath, d.internalId])
      }
    }
  })
}

function makeParentPath (f: AssetFolderRow) {
  return (f.path === '/' ? '/' : f.path + '/') + String(f.id)
}

async function copyAsset (a: AssetRowWithPagetreeId, targetrow: AssetFolderRow, user: string, versionedService: VersionedService, db: Queryable) {
  const data = await versionedService.get(a.dataId)
  if (!data) throw new Error(`Asset being copied "${a.name}" was corrupt.`)
  const dataId = await versionedService.create('asset', data.data, [], user, db)
  const linkId = a.pagetreeId === targetrow.pagetreeId || await db.getval('SELECT a.linkId FROM assets a INNER JOIN assetfolders f ON a.folderId=f.id WHERE f.pagetreeId=? AND a.linkId=?', [targetrow.pagetreeId, a.linkId]) ? nanoid(10) : a.linkId

  await db.insert('INSERT INTO assets (name, folderId, linkId, dataId, shasum) VALUES (?, ?, ?, ?, ?)', [a.name, targetrow.id, linkId, dataId, a.shasum])
}

async function copyFolder (f: AssetFolderRow, targetrow: AssetFolderRow, user: string, versionedService: VersionedService, db: Queryable) {
  const linkId = f.pagetreeId === targetrow.pagetreeId || await db.getval('SELECT linkId FROM assetfolders WHERE pagetreeId=? AND linkId=?', [targetrow.pagetreeId, f.linkId]) ? nanoid(10) : f.linkId
  const newFolderId = await db.insert('INSERT INTO assetfolders (siteId, linkId, path, name, pagetreeId) VALUES (?, ?, ?, ?, ?)', [targetrow.siteId, linkId, makeParentPath(targetrow), f.name, targetrow.pagetreeId])
  const newFolderRow = await db.getrow('SELECT * FROM assetfolders WHERE id = ?', [newFolderId])
  const assets = await db.getall<AssetRowWithPagetreeId>('SELECT a.*, f.pagetreeId FROM assets a INNER JOIN assetfolders f ON a.folderId=f.id WHERE a.folderId = ? AND a.deleteState = ?', [f.id, DeleteState.NOTDELETED])
  for (const a of assets) await copyAsset(a, newFolderRow, user, versionedService, db)
  const folders = await db.getall<AssetFolderRow>('SELECT * FROM assetfolders WHERE path = ? AND deleteState = ?', [makeParentPath(f), DeleteState.NOTDELETED])
  for (const cf of folders) await copyFolder(cf, newFolderRow, user, versionedService, db)
}

export async function copyAssets (targetFolder: AssetFolder, assets: Asset[], folders: AssetFolder[], user: string, versionedService: VersionedService) {
  await db.transaction(async db => {
    // re-pull everything inside the transaction
    const [targetrow, targetassetchildren, targetfolderchildren] = await Promise.all([
      db.getrow<AssetFolderRow>('SELECT * FROM assetfolders WHERE id=?', [targetFolder.internalId]),
      db.getall<AssetRowWithPagetreeId>('SELECT a.*, f.pagetreeId FROM assets a INNER JOIN assetfolders f ON a.folderId=f.id WHERE folderId = ?', [targetFolder.internalId]),
      db.getall<AssetFolderRow>('SELECT * FROM assetfolders WHERE path = ?', [targetFolder.pathAsParent])
    ])

    if (!targetrow) throw new Error('Target folder disappeared since the mutation began.')
    // Ensure the target folder has not moved.
    // Someone else may have moved it somewhere the current user does not have permission to create assets
    if (targetrow.path !== targetFolder.path) throw new Error('Target folder has moved since the mutation began.')

    const usedNames = new Set([...targetassetchildren, ...targetfolderchildren].map(c => c.name))

    let binds: number[] = []
    const folderrows = folders.length
      ? await db.getall<AssetFolderRow>(`SELECT * FROM assetfolders WHERE id IN (${db.in(binds, folders.map(f => f.internalId))})`, binds)
      : []

    // If folder selected to be copied is a descendent of one of the other folders being copied,
    // we don't need to copy it because it will be copied with its ancestor
    const filteredFolderRows = folderrows.filter(folder => !folderrows.some(f => folder.path === makeParentPath(f) || folder.path.startsWith(makeParentPath(f) + '/')))

    binds = []
    const assetrows = assets.length
      ? await db.getall<AssetRowWithPagetreeId>(`SELECT a.*, f.pagetreeId FROM assets a INNER JOIN assetfolders f ON a.folderId=f.id WHERE a.id IN (${db.in(binds, assets.map(a => a.internalId))})`, binds)
      : []

    // If a selected asset is already in one of the folders selected, we'll skip copying it since its folder
    // is also being copied. Users will potentially shift-select a big block of items including both folders and assets
    // and will not expect it all to get de-structured.
    const filteredAssetRows = assetrows.filter(asset => !folderrows.some(f => f.id === asset.folderId))

    if (filteredFolderRows.some(f => targetrow.id === f.id || targetrow.path.startsWith(makeParentPath(f) + '/'))) throw new Error('Cannot copy a folder into its own sub-folder.')

    // copy assets
    for (const a of filteredAssetRows) {
      if (usedNames.has(a.name)) throw new Error(`Asset "${a.name}" already exists in the target folder.`)
      await copyAsset(a, targetrow, user, versionedService, db)
    }

    // copy folders
    for (const f of filteredFolderRows) {
      if (usedNames.has(f.name)) throw new Error(`Folder "${f.name}" already exists in the target folder.`)
      await copyFolder(f, targetrow, user, versionedService, db)
    }
  })
}

export async function cleanupBinaries (checksums: string[]) {
  if (!checksums.length) return
  const binds: string[] = []
  const binaries = await db.getall<{ shasum: string }>(`SELECT shasum FROM binaries WHERE shasum IN (${db.in(binds, checksums)})`, binds)
  const hash = keyby(binaries, 'shasum')
  for (const checksum of checksums) {
    if (!hash[checksum]) await fileHandler.remove(checksum)
  }
}

export async function deleteAsset (id: number, userInternalId: number) {
  return await db.update('UPDATE assets SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [userInternalId, DeleteState.MARKEDFORDELETE, id])
}

export async function deleteAssets (ids: number[], userInternalId: number) {
  const binds: string[] = []
  return await db.update(`UPDATE assets SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id IN (${db.in(binds, ids)})`, [userInternalId, DeleteState.MARKEDFORDELETE, ...binds])
}

export async function finalizeAssetDeletion (ids: number[], userInternalId: number) {
  const deleteTime = DateTime.now().toFormat('yLLddHHmmss')
  const binds: string [] = []
  async function update () {
    return await db.update(`UPDATE assets SET linkId=LEFT(MD5(RAND()), 10), deletedAt = NOW(), deletedBy = ?, deleteState = ?, name = CONCAT(name, '-${deleteTime}') WHERE id IN (${db.in(binds, ids)})`, [userInternalId, DeleteState.DELETED, ...binds])
  }
  try {
    return await update()
  } catch (e: any) {
    if (e.code !== 1062) throw e
    // if we got a duplicate key error, try again and it will generate new linkIds
    return await update()
  }
}

export async function undeleteAssets (ids: number[]) {
  const binds: string[] = []
  return await db.update(`UPDATE assets SET deletedBy = null, deletedAt = null, deleteState = ? WHERE id IN (${db.in(binds, ids)})`, [DeleteState.NOTDELETED, ...binds])
}

export async function requestResizes (asset: Asset, opts?: { force?: boolean }) {
  if (!asset.box?.width) return
  if (!opts?.force) {
    const resizes = await getResizes([asset.internalId])
    if (resizes.length) return
  } else {
    await db.delete('DELETE rr FROM requestedresizes rr INNER JOIN binaries b ON b.id=rr.binaryId WHERE b.shasum=? AND (rr.completed IS NOT NULL OR rr.withError=1)', [asset.checksum])
  }
  await db.insert(`
    INSERT INTO requestedresizes (binaryId)
    SELECT id FROM binaries WHERE shasum=?
    ON DUPLICATE KEY UPDATE binaryId=binaryId
  `, [asset.checksum])
  await db.delete('DELETE FROM requestedresizes WHERE completed < NOW() - INTERVAL 1 HOUR')
}
