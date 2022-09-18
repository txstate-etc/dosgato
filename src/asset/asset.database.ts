import db from 'mysql2-async/db'
import { isNotNull, pick, stringify } from 'txstate-utils'
import { Asset, AssetFilter, AssetResize, VersionedService, AssetFolder } from '../internal.js'
import { DateTime } from 'luxon'
import { Queryable } from 'mysql2-async'

export interface CreateAssetInput {
  name: string
  folderId: string
  checksum: string
  mime: string
  size: number
  width?: number
  height?: number
}

function processFilters (filter?: AssetFilter) {
  const binds: string[] = []
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
      where.push(`assetfolders.guid IN (${db.in(binds, filter.folderIds)})`)
      if (!joins.has('assetfolders')) {
        joins.set('assetfolders', 'INNER JOIN assetfolders ON assets.folderId = assetfolders.id')
      }
    }
    if (filter.folderInternalIds?.length) {
      where.push(`assets.folderId IN (${db.in(binds, filter.folderInternalIds)})`)
    }
    if (filter.siteIds?.length) {
      where.push(`assetfolders.siteId IN (${db.in(binds, filter.siteIds)})`)
      if (!joins.has('assetfolders')) {
        joins.set('assetfolders', 'INNER JOIN assetfolders ON assets.folderId = assetfolders.id')
      }
    }
    if (filter.names?.length) {
      where.push(`assets.name IN (${db.in(binds, filter.names)})`)
    }
    if (isNotNull(filter.referenced)) {
      // TODO
    }
    if (isNotNull(filter.deleted)) {
      if (filter.deleted) {
        where.push('assets.deletedAt IS NOT NULL')
      } else {
        where.push('assets.deletedAt IS NULL')
      }
    }
    if (filter.checksums?.length) {
      where.push(`binaries.shasum IN (${db.in(binds, filter.checksums)})`)
    }
  }
  return { binds, where, joins }
}

export async function getAssets (filter?: AssetFilter, tdb: Queryable = db) {
  const { binds, where, joins } = processFilters(filter)
  const assets = await tdb.getall(`
    SELECT assets.id, assets.dataId, assets.name, assets.folderId, assets.deletedAt, assets.deletedBy, binaries.bytes AS filesize, binaries.mime, binaries.shasum, binaries.meta FROM assets
    INNER JOIN binaries on assets.shasum = binaries.shasum
    ${joins.size ? Array.from(joins.values()).join('\n') : ''}
    WHERE (${where.join(') AND (')})`, binds)
  return assets.map(a => new Asset(a))
}

export async function getResizes (assetInternalIds: number[]) {
  const binds: string[] = []
  const where: string[] = []
  where.push(`a.id IN (${db.in(binds, assetInternalIds)})`)
  const resizes = await db.getall(`SELECT a.id as assetId, r.*, rb.shasum, rb.bytes, rb.mime
  FROM resizes r
  INNER JOIN binaries b ON r.originalBinaryId = b.id
  INNER JOIN binaries rb ON r.binaryId = rb.id
  INNER JOIN assets a ON b.shasum = a.shasum
  WHERE (${where.join(') AND (')})
  ORDER BY rb.bytes`, binds)
  return resizes.map(row => ({ key: row.assetId, value: new AssetResize(row) }))
}

export async function getResizesById (resizeIds: string[]) {
  const rows = await db.getall(`SELECT r.*, rb.shasum, rb.bytes, rb.mime
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

export async function createAsset (versionedService: VersionedService, userId: string, args: CreateAssetInput) {
  return await db.transaction(async db => {
    const dataId = await versionedService.create('asset', { shasum: args.checksum }, [], userId, db)
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

export async function registerResize (asset: Asset, width: number, shasum: string, mime: string, quality: number, size: number) {
  const height = asset.box!.height * width / asset.box!.width
  return await db.transaction(async db => {
    const binaryId = await db.insert(`
      INSERT IGNORE INTO binaries (shasum, mime, meta, bytes) VALUES (?, ?, ?, ?)
    `, [shasum, mime, stringify({ width, height }), size])
    const origBinaryId = await db.getval<number>('SELECT id FROM binaries WHERE shasum=?', [asset.checksum])
    await db.insert(`
      INSERT INTO resizes (binaryId, originalBinaryId, width, height, quality, othersettings) VALUES (?, ?, ?, ?, ?, ?)
    `, [binaryId, origBinaryId!, width, height, quality, stringify({})])
    return binaryId
  })
}

export async function moveAsset (id: number, targetFolder: AssetFolder) {
  return await db.transaction(async db => {
    const folder = new AssetFolder(await db.getrow('SELECT * FROM assetfolders WHERE id = ?', [targetFolder.internalId]))
    // Ensure the target folder has not moved.
    // Someone else may have moved it somewhere the current user does not have permission to create assets
    if (folder.path !== targetFolder.path) throw new Error('Target folder has moved since the mutation began.')
    return await db.update('UPDATE assets set folderId = ? WHERE id = ?', [targetFolder.internalId, id])
  })
}

export async function deleteAsset (id: number, userInternalId: number) {
  return await db.update('UPDATE assets SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [userInternalId, id])
}

export async function undeleteAsset (id: number) {
  return await db.update('UPDATE assets SET deletedBy = null, deletedAt = null WHERE id = ?', [id])
}
