import { BaseService, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { lookup } from 'mime-types'
import sharp from 'sharp'
import { intersect, isBlank, isNotNull, keyby, roundTo, sortby } from 'txstate-utils'
import {
  Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes,
  SiteService, DosGatoService, getLatestDownload, AssetFolderServiceInternal, AssetResponse,
  fileHandler, deleteAsset, undeleteAsset, popPath, basename, registerResize,
  getResizesById, VersionedService, cleanupBinaries, getDownloads, DownloadsFilter, getResizeDownloads,
  AssetResize, AssetFolderResponse, moveAssets, copyAssets, finalizeAssetDeletion, DeletedFilter, renameAsset, updateAssetMeta
} from '../internal.js'

const thumbnailMimes = new Set(['image/jpg', 'image/jpeg', 'image/gif', 'image/png'])

const assetsByIdLoader = new PrimaryKeyLoader({
  fetch: async (dataIds: string[]) => await getAssets({ ids: dataIds, deleted: DeletedFilter.SHOW })
})

const assetsByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => await getAssets({ internalIds, deleted: DeletedFilter.SHOW }),
  extractId: asset => asset.internalId,
  idLoader: assetsByIdLoader
})
assetsByIdLoader.addIdLoader(assetsByInternalIdLoader)

const assetsByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter: AssetFilter) => await getAssets({ ...filter, folderInternalIds }),
  keysFromFilter: (filter: AssetFilter | undefined) => filter?.folderInternalIds ?? [],
  extractKey: asset => asset.folderInternalId,
  idLoader: [assetsByIdLoader, assetsByInternalIdLoader]
})

const resizesByAssetIdLoader = new ManyJoinedLoader({
  fetch: async (assetInternalIds: number[]) => await getResizes(assetInternalIds)
})

const resizeLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getResizesById(ids)
})

const downloadsByAssetIdLoader = new OneToManyLoader({
  fetch: async (assetIds: string[], filter: DownloadsFilter) => await getDownloads(assetIds, filter),
  extractKey: dr => dr.relatedId
})

const downloadsByResizeIdLoader = new OneToManyLoader({
  fetch: async (resizeIds: string[], filter: DownloadsFilter) => await getResizeDownloads(resizeIds, filter),
  extractKey: dr => dr.relatedId
})

const exifToRotation: Record<number, number> = {
  1: 0,
  2: 0,
  3: 180,
  4: 0,
  5: 270,
  6: 90,
  7: 270,
  8: 270
}

const exifToFlip: Record<number, boolean> = {
  1: false,
  2: false,
  3: false,
  4: true,
  5: false,
  6: false,
  7: true,
  8: false
}

const exifToFlop: Record<number, boolean> = {
  1: false,
  2: true,
  3: false,
  4: false,
  5: true,
  6: false,
  7: false,
  8: false
}

export class AssetServiceInternal extends BaseService {
  async find (filter: AssetFilter) {
    const assets = await getAssets(await this.processAssetFilters(filter))
    for (const asset of assets) this.loaders.get(assetsByIdLoader).prime(asset.id, asset)
    return assets
  }

  async findById (id: string) {
    return await this.loaders.get(assetsByIdLoader).load(id)
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(assetsByInternalIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(assetsByIdLoader, ids)
  }

  async findByFolder (folder: AssetFolder, filter?: AssetFilter) {
    return await this.findByFolderInternalId(folder.internalId, filter)
  }

  async findByFolderInternalId (folderInternalId: number, filter?: AssetFilter) {
    filter = await this.processAssetFilters(filter)
    return await this.loaders.get(assetsByFolderInternalIdLoader, filter).load(folderInternalId)
  }

  async findByFolders (folders: AssetFolder[], filter?: AssetFilter) {
    filter = await this.processAssetFilters(filter)
    return await this.loaders.loadMany(assetsByFolderInternalIdLoader, folders.map(f => f.internalId), filter)
  }

  async getAncestors (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    if (!folder) return []
    return [...await this.svc(AssetFolderServiceInternal).getAncestors(folder), folder]
  }

  async getSite (asset: Asset) {
    const ancestors = await this.getAncestors(asset)
    return await this.svc(SiteService).findByAssetRootId(ancestors[0].internalId)
  }

  async getPath (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    if (!folder) return '/'
    return appendPath(await this.svc(AssetFolderServiceInternal).getPath(folder), asset.name as string)
  }

  async getData (asset: Asset, version?: number) {
    return (await this.svc(VersionedService).get(asset.dataId, { version }))!.data
  }

  async processAssetFilters (filter?: AssetFilter) {
    if (filter?.legacyIds?.length) {
      const ids = await this.svc(VersionedService).find([{ indexName: 'legacyId', in: filter.legacyIds }], 'asset')
      filter.ids = intersect({ skipEmpty: true }, filter.ids, ids)
      if (!filter.ids.length) filter.internalIds = [-1]
    }

    if (filter?.paths?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.paths.map(popPath))
      const folderids = folderidpaths.map(p => +p.split(/\//).slice(-1)[0])
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, folderids)
      filter.names = filter.paths.map(basename)
      if (!folderidpaths.length) filter.internalIds = [-1]
    }

    if (filter?.beneath?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.beneath)
      const folders = await this.svc(AssetFolderServiceInternal).getChildFoldersByIDPaths(folderidpaths)
      const ids = [...folders.map(f => f.internalId), ...folderidpaths.map(basename).map(Number)]
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, ids)
      if (!folderidpaths.length) filter.internalIds = [-1]
    }

    if (filter?.parentPaths?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.parentPaths)
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, folderidpaths.map(basename).map(Number))
      if (!folderidpaths.length) filter.internalIds = [-1]
    }

    if (filter?.links?.length) {
      const assets = await this.findByIds(filter.links.map(l => l.id))
      const assetsById = keyby(assets, 'id')
      const notFoundById = filter.links.filter(l => !assetsById[l.id])
      if (notFoundById.length) {
        const [pathAssets, checksumAssets] = await Promise.all([
          this.find({ paths: notFoundById.map(l => l.path) }),
          this.find({ checksums: notFoundById.map(l => l.checksum) })
        ])

        const assetsByPath: Record<string, Asset> = {}
        await Promise.all(pathAssets.map(async a => {
          assetsByPath[await this.getPath(a)] = a
        }))
        const assetsByChecksum = keyby(checksumAssets, 'checksum')
        assets.push(...notFoundById.map(link => assetsByPath[link.path] ?? assetsByChecksum[link.checksum]).filter(isNotNull))
      }
      if (!assets.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, assets.map(a => a.internalId))
    }

    return filter
  }
}

export class AssetService extends DosGatoService<Asset> {
  raw = this.svc(AssetServiceInternal)

  async find (filter: AssetFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findByFolder (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.findByFolder(folder))
  }

  async findByFolders (folders: AssetFolder[]) {
    return await this.removeUnauthorized(await this.raw.findByFolders(folders))
  }

  async getAncestors (asset: Asset) {
    return await this.svc(AssetFolderService).removeUnauthorized(await this.raw.getAncestors(asset))
  }

  async getSite (asset: Asset) {
    return await this.svc(SiteService).removeUnauthorized(await this.raw.getSite(asset))
  }

  async getPath (asset: Asset) {
    return await this.raw.getPath(asset)
  }

  async getResizes (asset: Asset) {
    return await this.loaders.get(resizesByAssetIdLoader).load(asset.internalId)
  }

  async getResize (resizeId: string) {
    return await this.loaders.get(resizeLoader).load(resizeId)
  }

  async getThumbnail (asset: Asset) {
    const resizes = sortby((await this.getResizes(asset)).filter(r => thumbnailMimes.has(r.mime)), 'size')
    return resizes.find(r => r.width > 300) ?? resizes[0]
  }

  async getLatestDownload (asset: Asset) {
    const resizes = await this.getResizes(asset)
    return await getLatestDownload(asset, resizes.map(r => r.binaryId))
  }

  async getData (asset: Asset) {
    return await this.raw.getData(asset) as { legacyId?: string, shasum: string, uploadedFilename: string }
  }

  async getDownloads (asset: Asset, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByAssetIdLoader, filter).load(asset.dataId)
  }

  async getResizeDownloads (resize: AssetResize, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByResizeIdLoader, filter).load(resize.id)
  }

  async move (folderId: string, assetIds?: string[], folderIds?: string[]) {
    const [assets, folders, targetFolder] = await Promise.all([
      this.raw.findByIds(assetIds ?? []),
      this.svc(AssetFolderServiceInternal).findByIds(folderIds ?? []),
      this.svc(AssetFolderServiceInternal).findById(folderId)
    ])
    if (!targetFolder) throw new Error('Target asset folder does not exist.')
    if (folders.some(f => f.parentInternalId == null)) throw new Error('Root asset folders cannot be moved.')
    const assetSvc = this.svc(AssetService)
    const folderSvc = this.svc(AssetFolderService)
    const [haveCreatePerm] = await Promise.all([
      folderSvc.mayCreate(targetFolder),
      ...assets.map(async a => {
        if (!await assetSvc.mayMove(a)) throw new Error(`You are not permitted to move asset ${a.filename}.`)
      }),
      ...folders.map(async f => {
        if (!await folderSvc.mayMove(f)) throw new Error(`You are not permitted to move asset folder ${f.name}.`)
      })
    ])
    if (!haveCreatePerm) throw new Error(`You are not permitted to move files into folder ${targetFolder.name}`)
    await moveAssets(targetFolder, assets, folders)
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async rename (assetId: string, name: string, validateOnly?: boolean) {
    if (isBlank(name)) return ValidatedResponse.error('Name is required.', 'name')
    const asset = await this.raw.findById(assetId)
    if (!asset) throw new Error('Asset not found.')
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    const [siblings, siblingFolders] = await Promise.all([
      this.raw.findByFolderInternalId(asset.folderInternalId),
      this.svc(AssetFolderServiceInternal).getChildFolders(folder!)
    ])
    const response = new AssetResponse({ asset })
    if (siblings.some(s => s.name === name) || siblingFolders.some(f => f.name === name)) response.addMessage('That name is already taken.', 'name')
    else response.addMessage('Name is available.', 'name', MutationMessageType.success)
    if (response.hasErrors() || validateOnly) return response
    await renameAsset(assetId, name, folder!.path)
    this.loaders.clear()
    const newAsset = await this.raw.findById(assetId)
    response.success = true
    response.asset = newAsset
    return response
  }

  async update (assetId: string, data: any, validateOnly?: boolean) {
    const asset = await this.raw.findById(assetId)
    if (!asset) throw new Error('Asset not found.')
    const siblings = await this.raw.findByFolderInternalId(asset.folderInternalId)
    const response = new AssetResponse({ asset })
    if (response.hasErrors() || validateOnly) return response
    await updateAssetMeta(this.svc(VersionedService), asset, data, this.login)
    this.loaders.clear()
    const newAsset = await this.raw.findById(assetId)
    response.success = true
    response.asset = newAsset
    return response
  }

  async copy (folderId: string, assetIds?: string[], folderIds?: string[]) {
    const [assets, folders, targetFolder] = await Promise.all([
      this.raw.findByIds(assetIds ?? []),
      this.svc(AssetFolderServiceInternal).findByIds(folderIds ?? []),
      this.svc(AssetFolderServiceInternal).findById(folderId)
    ])
    if (!targetFolder) throw new Error('Target asset folder does not exist.')
    if (folders.some(f => f.parentInternalId == null)) throw new Error('Root asset folders cannot be copied.')
    if (!await this.svc(AssetFolderService).mayCreate(targetFolder)) throw new Error(`You are not permitted to copy files into folder ${targetFolder.name}`)
    await copyAssets(targetFolder, assets, folders, this.login, this.svc(VersionedService))
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async delete (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be deleted does not exist')
    if (!(await this.haveAssetPerm(asset, 'delete'))) throw new Error(`Current user is not permitted to delete asset ${String(asset.name)}.${asset.extension}.`)
    const currentUser = await this.currentUser()
    try {
      await deleteAsset(asset.internalId, currentUser!.internalId)
      this.loaders.clear()
      const deletedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: deletedAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not delete asset')
    }
  }

  async finalizeDeletion (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be deleted does not exist')
    if (!(await this.haveAssetPerm(asset, 'delete'))) throw new Error(`Current user is not permitted to delete asset ${String(asset.name)}.${asset.extension}.`)
    const currentUser = await this.currentUser()
    await finalizeAssetDeletion(asset.internalId, currentUser!.internalId)
    this.loaders.clear()
    const deletedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
    return new AssetResponse({ asset: deletedAsset, success: true })
  }

  async undelete (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be restored does not exist')
    if (!(await this.haveAssetPerm(asset, 'undelete'))) throw new Error(`Current user is not permitted to restore asset ${String(asset.name)}.${asset.extension}.`)
    try {
      await undeleteAsset(asset.internalId)
      this.loaders.clear()
      const restoredAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: restoredAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not restore asset folder')
    }
  }

  async createResizes (asset: Asset) {
    if (!asset.box || asset.mime === 'image/svg+xml') return
    const resizes = await this.getResizes(asset)
    let missingresize = false
    for (let w = asset.box.width; w >= 100; w = roundTo(w / 2)) {
      if (!resizes.find(r => r.mime === 'image/webp' && r.width === w)) missingresize = true
    }
    if (!missingresize) return

    const info = await fileHandler.sharp(asset.checksum).metadata()
    const orientation = info.orientation ?? 1
    const animated = (info.pages ?? 0) > 0 && info.format !== 'heif'
    const img = fileHandler.sharp(asset.checksum, { animated })

    // make the lossless vs lossy decision only once, at the biggest size
    const biggestwebpresize = resizes.find(r => r.mime === 'image/webp' && r.width === asset.box!.width)
    let uselossless: boolean | undefined = biggestwebpresize?.lossless

    for (let w = asset.box.width; w >= 100; w = roundTo(w / 2)) {
      const webpresize = resizes.find(r => r.mime === 'image/webp' && r.width === w)
      if (!webpresize) {
        const resized = img.clone().resize(w, null, { kernel: 'mitchell' })
        // theoretically one call to .rotate() is supposed to fix orientation, but
        // there seems to be a bug in sharpjs where the rotation doesn't take
        // if there is a later resize to a sufficiently small size
        // this is a workaround to make sure the exif rotation is applied in all cases
        .flip(exifToFlip[orientation])
        .flop(exifToFlop[orientation])
        .rotate(exifToRotation[orientation])
        let webp: sharp.Sharp | undefined, webpsum: string | undefined, webpinfo: sharp.OutputInfo | undefined

        if (uselossless !== true) {
          webp = resized.clone().webp({ quality: 75, effort: 6, loop: info.loop ?? 0 })
          ;({ checksum: webpsum, info: webpinfo } = await fileHandler.sharpWrite(webp))
        }

        if (uselossless !== false) {
          // try making a near-lossless version and see whether it's acceptably small
          const lossless = resized.clone().webp({ quality: 75, effort: 6, loop: info.loop ?? 0, nearLossless: true })
          const { checksum: losslesssum, info: losslessinfo } = await fileHandler.sharpWrite(lossless)
          if (uselossless === true || losslessinfo.size < webpinfo!.size * 1.2) {
            if (webpsum) await cleanupBinaries([webpsum])
            webp = lossless
            webpsum = losslesssum
            webpinfo = losslessinfo
            uselossless = true
          } else {
            uselossless = false
            await cleanupBinaries([losslesssum])
          }
        }

        await registerResize(asset, w, webpsum!, 'image/webp', 75, webpinfo!.size, uselossless)

        const outputformat = uselossless
          ? (animated ? 'gif' : 'png')
          : 'jpg'
        const outputmime = lookup(outputformat) as string

        const formatted = outputformat === 'jpg'
          ? resized.clone().jpeg({ quality: 65 })
          : outputformat === 'png'
            ? resized.clone().png({ compressionLevel: 9, progressive: true })
            : resized.clone().gif({ effort: 10, reoptimize: true, loop: info.loop ?? 0 } as any)
        const { checksum, info: outputinfo } = await fileHandler.sharpWrite(formatted)
        if (outputinfo.size > asset.size && ['image/jpeg', 'image/png', 'image/gif'].includes(asset.mime)) {
          // we made a resize that's bigger than the original and no more compatible, abort!
          await cleanupBinaries([checksum])
        } else {
          await registerResize(asset, w, checksum, outputmime, outputformat === 'jpg' ? 65 : 0, outputinfo.size, outputformat === 'gif' || outputformat === 'jpg')
        }
      }
    }
  }

  async mayViewManagerUI () {
    return (await this.currentAssetRules()).some(r => r.grants.viewForEdit)
  }

  async mayView (asset: Asset) {
    return await this.haveAssetPerm(asset, 'view')
  }

  async mayViewForEdit (asset: Asset) {
    return await this.haveAssetPerm(asset, 'viewForEdit')
  }

  async mayUpdate (asset: Asset) {
    return await this.haveAssetPerm(asset, 'update')
  }

  async mayMove (asset: Asset) {
    return await this.haveAssetPerm(asset, 'move')
  }

  async mayDelete (asset: Asset) {
    return await this.haveAssetPerm(asset, 'delete')
  }

  async mayUndelete (asset: Asset) {
    return await this.haveAssetPerm(asset, 'undelete')
  }
}
