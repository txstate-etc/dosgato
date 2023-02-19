import { DateTime } from 'luxon'
import { Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { isNotNull, keyby, pick, stringify } from 'txstate-utils'
import { Asset, AssetFilter, AssetResize, VersionedService, AssetFolder, fileHandler, DownloadRecord, DownloadsFilter, DownloadsResolution, AssetFolderRow, DeleteState, DeletedFilter } from '../internal.js'

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
}

export interface ReplaceAssetInput extends AssetInput {
  assetId: string
}

export interface AssetRow {
  id: number
  name: string
  folderId: number
  dataId: string
  shasum: string
  deletedAt?: Date
}

function processFilters (filter?: AssetFilter) {
  const binds: (string | number)[] = []
  const where: string[] = []
  const joins = new Map<string, string>()

  if (typeof filter !== 'undefined') {
    if (filter.internalIds?.length) {
      where.push(`assets.id IN (${db.in(binds, filter.internalIds)})`)
    }
    if (filter.ids?.length) {
      where.push(`assets.dataId IN (${db.in(binds, filter.ids)})`)
    }
    if (filter.folderIds?.length) {
      joins.set('assetfolders', 'INNER JOIN assetfolders ON assets.folderId = assetfolders.id')
      where.push(`assetfolders.guid IN (${db.in(binds, filter.folderIds)})`)
    }
    if (filter.folderInternalIds?.length) {
      where.push(`assets.folderId IN (${db.in(binds, filter.folderInternalIds)})`)
    }
    if (filter.siteIds?.length) {
      joins.set('assetfolders', 'INNER JOIN assetfolders ON assets.folderId = assetfolders.id')
      where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
    }
    if (filter.names?.length) {
      where.push(`assets.name IN (${db.in(binds, filter.names)})`)
    }
    if (isNotNull(filter.referenced)) {
      // TODO
    }
    if (!filter.deleted || filter.deleted === DeletedFilter.HIDE) {
      // hide fully deleted assets
      where.push(`assets.deleteState != ${DeleteState.DELETED}`)
    } else if (filter.deleted === DeletedFilter.ONLY) {
      // Only show deleted assets
      where.push(`assets.deleteState = ${DeleteState.DELETED}`)
    }
    if (filter.checksums?.length) {
      where.push(`binaries.shasum IN (${db.in(binds, filter.checksums)})`)
    }
    if (isNotNull(filter.bytes)) {
      if (filter.bytes < 0) where.push('binaries.bytes < ?')
      else where.push('binaries.bytes > ?')
      binds.push(Math.abs(filter.bytes))
    }
  }
  return { binds, where, joins }
}

export async function getAssets (filter?: AssetFilter, tdb: Queryable = db) {
  const { binds, where, joins } = processFilters(filter)
  const assets = await tdb.getall(`
    SELECT assets.id, assets.dataId, assets.name, assets.folderId, assets.deletedAt, assets.deletedBy, assets.deleteState, binaries.bytes AS filesize, binaries.mime, binaries.shasum, binaries.meta FROM assets
    INNER JOIN binaries on assets.shasum = binaries.shasum
    ${joins.size ? Array.from(joins.values()).join('\n') : ''}
    ${where.length ? `WHERE (${where.join(') AND (')})` : ''}`, binds)
  return assets.map(a => new Asset(a))
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
        add({ ...row, day: 1, downloads: row.downloads / dt.daysInMonth })
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
          add({ ...row, year: week.year, month: week.month, day: week.day, downloads: row.downloads / start.daysInMonth })
        }
      } else {
        const start = DateTime.local(row.year, 1, 1)
        const end = start.endOf('year')
        for (let dt = start; dt < end; dt = dt.plus({ days: 1 })) {
          const week = dt.startOf('week')
          add({ ...row, year: week.year, month: week.month, day: week.day, downloads: row.downloads / start.daysInMonth })
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
  const indexes = data.legacyId ? [{ name: 'legacyId', values: [data.legacyId] }] : []
  return indexes
}

export async function createAsset (versionedService: VersionedService, userId: string, args: CreateAssetInput) {
  return await db.transaction(async db => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const createdBy = args.legacyId ? (args.createdBy || args.modifiedBy || userId) : userId // || is intended - to catch blanks
    const createdAt = args.legacyId ? (args.createdAt ?? args.modifiedAt ?? undefined) : undefined
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const modifiedBy = args.legacyId ? (args.modifiedBy || createdBy || userId) : userId // || is intended - to catch blanks
    const modifiedAt = args.legacyId ? (args.modifiedAt ?? args.createdAt ?? undefined) : undefined
    const data = { legacyId: args.legacyId, shasum: args.checksum, uploadedFilename: args.filename, meta: args.meta }
    const dataId = await versionedService.create('asset', data, getIndexes(data), createdBy, db)
    await versionedService.setStamps(dataId, { createdAt: createdAt ? new Date(createdAt) : undefined, modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined, modifiedBy: modifiedBy !== userId ? modifiedBy : undefined }, db)
    const folderInternalId = await db.getval<string>('SELECT id FROM assetfolders WHERE guid = ?', [args.folderId])
    await db.insert(`
      INSERT IGNORE INTO binaries (shasum, mime, meta, bytes)
      VALUES(?, ?, ?, ?)`, [args.checksum, args.mime, stringify(pick(args, 'width', 'height')), args.size])
    const newInternalId = await db.insert(`
      INSERT INTO assets (name, folderId, dataId, shasum)
      VALUES(?, ?, ?, ?)`, [args.name, folderInternalId!, dataId, args.checksum])
    return (await getAssets({ internalIds: [newInternalId] }, db))[0]
  })
}

export async function replaceAsset (versionedService: VersionedService, userId: string, args: ReplaceAssetInput) {
  return await db.transaction(async db => {
    const data = await versionedService.get(args.assetId)
    if (!data) throw new Error('Asset to be updated had no backing data.')
    await db.insert(`
    INSERT IGNORE INTO binaries (shasum, mime, meta, bytes)
    VALUES(?, ?, ?, ?)`, [args.checksum, args.mime, stringify(pick(args, 'width', 'height')), args.size])
    const newData = { ...data.data, shasum: args.checksum, uploadedFilename: args.filename, meta: args.meta }
    await versionedService.update(args.assetId, newData, getIndexes(newData), { user: userId }, db)
    const modifiedBy = data.data.legacyId ? (args.modifiedBy ?? userId) : userId
    const modifiedAt = data.data.legacyId ? (args.modifiedAt ?? undefined) : undefined
    await versionedService.setStamps(args.assetId, { modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined, modifiedBy: modifiedBy !== userId ? modifiedBy : undefined }, db)
    await db.update('UPDATE assets SET shasum=? WHERE dataId=?', [args.checksum, args.assetId])
    return (await getAssets({ ids: [args.assetId] }, db))[0]
  })
}

export async function updateAssetMeta (versionedService: VersionedService, asset: Asset, meta: any, userId: string, stamps?: { modifiedBy: string, modifiedAt: Date }) {
  const oldVersion = await versionedService.get(asset.dataId)
  if (!oldVersion) throw new Error('Asset data missing.')
  const newData = {
      ...oldVersion.data,
      meta
  }
  await versionedService.update(asset.dataId, newData, getIndexes(newData), { user: userId })
  if (newData.legacyId && stamps) await versionedService.setStamps(asset.dataId, stamps, db)
}

export async function renameAsset (assetId: string, name: string, folderInternalIdPath: string) {
  const affectedRows = await db.update(`
    UPDATE assets a
    LEFT JOIN assets adupe ON a.id != adupe.id AND a.folderId=adupe.folderId AND adupe.name=?
    LEFT JOIN assetfolders fdupe ON fdupe.path=? AND fdupe.name=?
    SET a.name=?
    WHERE a.id=? AND adupe.id IS NULL AND fdupe.id IS NULL
  `, [name, folderInternalIdPath, name, name, assetId])
  if (affectedRows === 0) throw new Error('Rename failed, likely the name became unavailable.')
}

export async function registerResize (asset: Asset, width: number, shasum: string, mime: string, quality: number, size: number, lossless: boolean) {
  const height = asset.box!.height * width / asset.box!.width
  return await db.transaction(async db => {
    const binaryId = await db.insert(`
      INSERT INTO binaries (shasum, mime, meta, bytes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [shasum, mime, stringify({ width, height, lossless }), size])
    const origBinaryId = await db.getval<number>('SELECT id FROM binaries WHERE shasum=?', [asset.checksum])
    await db.insert(`
      INSERT INTO resizes (binaryId, originalBinaryId, width, height, quality, othersettings) VALUES (?, ?, ?, ?, ?, ?)
    `, [binaryId, origBinaryId!, width, height, quality, stringify({})])
    return binaryId
  })
}

export async function moveAssets (targetFolder: AssetFolder, assets: Asset[], folders: AssetFolder[]) {
  return await db.transaction(async db => {
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

    // If folder selected to be moved is a descendent of one of the other folders being moved,
    // we don't need to move it because it will be moved with its ancestor
    const filteredFolderRows = folderrows.filter(folder => !folderrows.some(f => folder.path === makeParentPath(f) || folder.path.startsWith(makeParentPath(f) + '/')))

    binds = []
    const assetrows = assets.length
      ? await db.getall<AssetRow>(`SELECT * FROM assets WHERE id IN (${db.in(binds, assets.map(a => a.internalId))})`, binds)
      : []

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

async function copyAsset (a: AssetRow, targetrow: AssetFolderRow, user: string, versionedService: VersionedService, db: Queryable) {
  const data = await versionedService.get(a.dataId)
  if (!data) throw new Error(`Asset being copied "${a.name}" was corrupt.`)
  const dataId = await versionedService.create('asset', data.data, [], user, db)
  await db.insert('INSERT INTO assets (name, folderId, dataId, shasum) VALUES (?, ?, ?, ?)', [a.name, targetrow.id, dataId, a.shasum])
}

async function copyFolder (f: AssetFolderRow, targetrow: AssetFolderRow, user: string, versionedService: VersionedService, db: Queryable) {
  const newFolderId = await db.insert('INSERT INTO assetfolders (siteId, path, name, guid) VALUES (?, ?, ?, ?)', [targetrow.siteId, makeParentPath(targetrow), f.name, nanoid(10)])
  const newFolderRow = await db.getrow('SELECT * FROM assetfolders WHERE id = ?', [newFolderId])
  const assets = await db.getall<AssetRow>('SELECT * FROM assets WHERE folderId = ?', [f.id])
  for (const a of assets) await copyAsset(a, newFolderRow, user, versionedService, db)
  const folders = await db.getall<AssetFolderRow>('SELECT * FROM assetfolders WHERE path = ?', [makeParentPath(f)])
  for (const cf of folders) await copyFolder(cf, newFolderRow, user, versionedService, db)
}

export async function copyAssets (targetFolder: AssetFolder, assets: Asset[], folders: AssetFolder[], user: string, versionedService: VersionedService) {
  return await db.transaction(async db => {
    // re-pull everything inside the transaction
    const [targetrow, targetassetchildren, targetfolderchildren] = await Promise.all([
      db.getrow<AssetFolderRow>('SELECT * FROM assetfolders WHERE id=?', [targetFolder.internalId]),
      db.getall<AssetRow>('SELECT * FROM assets WHERE folderId = ?', [targetFolder.internalId]),
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
      ? await db.getall<AssetRow>(`SELECT * FROM assets WHERE id IN (${db.in(binds, assets.map(a => a.internalId))})`, binds)
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

export async function finalizeAssetDeletion (id: number, userInternalId: number) {
  return await db.update('UPDATE assets SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [userInternalId, DeleteState.DELETED, id])
}

export async function undeleteAsset (id: number) {
  return await db.update('UPDATE assets SET deletedBy = null, deletedAt = null, deleteState = ? WHERE id = ?', [DeleteState.NOTDELETED, id])
}
