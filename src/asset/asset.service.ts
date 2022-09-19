import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { intersect, isNotNull, keyby, roundTo, sortby } from 'txstate-utils'
import {
  Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes,
  SiteService, DosGatoService, getLatestDownload, AssetFolderServiceInternal, AssetResponse,
  fileHandler, deleteAsset, undeleteAsset, moveAsset, popPath, basename, registerResize,
  getResizesById
} from '../internal.js'
import { lookup } from 'mime-types'

const thumbnailMimes = new Set(['image/jpg', 'image/jpeg', 'image/gif', 'image/png'])

const assetsByIdLoader = new PrimaryKeyLoader({
  fetch: async (dataIds: string[]) => await getAssets({ ids: dataIds })
})

const assetsByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => await getAssets({ internalIds }),
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
    filter = await this.processAssetFilters(filter)
    return await this.loaders.get(assetsByFolderInternalIdLoader, filter).load(folder.internalId)
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

  async processAssetFilters (filter?: AssetFilter) {
    if (filter?.paths?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.paths.map(popPath))
      const folderids = folderidpaths.map(p => +p.split(/\//).slice(-1)[0])
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, folderids)
      filter.names = filter.paths.map(basename)
    }

    if (filter?.beneath?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.beneath)
      const folders = await this.svc(AssetFolderServiceInternal).getChildFoldersByIDPaths(folderidpaths)
      const ids = [...folders.map(f => f.internalId), ...folderidpaths.map(basename).map(Number)]
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, ids)
    }

    if (filter?.parentPaths?.length) {
      const folderidpaths = await this.svc(AssetFolderServiceInternal).convertPathsToIDPaths(filter.parentPaths)
      filter.folderInternalIds = intersect({ skipEmpty: true }, filter.folderInternalIds, folderidpaths.map(basename).map(Number))
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
    const resizes = sortby(await this.getResizes(asset), 'size')
    return resizes.find(r => thumbnailMimes.has(r.mime))
  }

  async getLatestDownload (asset: Asset) {
    const resizes = await this.getResizes(asset)
    return await getLatestDownload(asset, resizes.map(r => r.binaryId))
  }

  async move (dataId: string, folderId: string) {
    const [asset, folder] = await Promise.all([
      this.loaders.get(assetsByIdLoader).load(dataId),
      this.svc(AssetFolderServiceInternal).findById(folderId)
    ])
    if (!asset) throw new Error('Asset to be moved does not exist')
    if (!folder) throw new Error('Target asset folder does not exist')
    if (!(await this.haveAssetPerm(asset, 'move'))) throw new Error(`Current user is not permitted to move asset ${String(asset.name)}.${asset.extension}.`)
    if (!(await this.haveAssetFolderPerm(folder, 'create'))) throw new Error(`Current user is not permitted to move files to folder ${String(folder.name)}`)
    try {
      await moveAsset(asset.internalId, folder)
      this.loaders.clear()
      const movedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: movedAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not move asset')
    }
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
    if (!asset.box) return
    const resizes = await this.getResizes(asset)
    const info = await fileHandler.sharp(asset.checksum).metadata()
    const orientation = info.orientation ?? 1
    const colors = await new Promise<number>((resolve, reject) => {
      const colorSet = new Set<string>()
      fileHandler.sharp(asset.checksum)
        .raw()
        .on('data', (b: Buffer) => {
          for (let offset = 0; offset < b.length && colorSet.size < 10000; offset += info.channels!) {
            const colorString = Array.from({ length: info.channels! }, (_, i) => b[offset + i]).join(',')
            colorSet.add(colorString)
          }
        })
        .on('error', () => reject(new Error('there was a problem counting colors in image ' + asset.filename)))
        .on('end', () => resolve(colorSet.size))
    })
    const outputformat: 'jpg' | 'png' | 'gif' = colors >= 10000
      ? 'jpg'
      : (info.pages ?? 0) > 0 && info.format !== 'heif'
        ? 'gif'
        : 'png'
    const outputmime = lookup(outputformat) as string

    const img = fileHandler.sharp(asset.checksum, { animated: outputformat === 'gif' })
    for (let w = asset.box.width; w > 100; w = roundTo(w / 2)) {
      const needregular = !resizes.some(r => r.mime === outputmime && r.width === w)
      const needwebp = !resizes.some(r => r.mime === 'image/webp' && r.width === w)
      if (needregular || needwebp) {
        const resized = img.clone().resize(w, null, { kernel: 'mitchell' })
          // theoretically one call to .rotate() is supposed to fix orientation, but
          // there seems to be a bug in sharpjs where the rotation doesn't take
          // if there is a later resize to a sufficiently small size
          // this is a workaround to make sure the exif rotation is applied in all cases
          .flip(exifToFlip[orientation])
          .flop(exifToFlop[orientation])
          .rotate(exifToRotation[orientation])
        if (needregular) {
          const formatted = outputformat === 'jpg'
            ? resized.clone().jpeg({ quality: 65 })
            : outputformat === 'png'
              ? resized.clone().png({ palette: colors <= 256, compressionLevel: 9, progressive: true })
              : resized.clone().gif({ effort: 10, reoptimize: true, loop: info.loop ?? 0 } as any)
          const { checksum, info: outputinfo } = await fileHandler.sharpWrite(formatted)
          await registerResize(asset, w, checksum, outputmime, outputformat === 'jpg' ? 60 : 0, outputinfo.size)
        }
        if (needwebp) {
          const webp = resized.webp({ quality: 65, effort: 6, loop: info.loop ?? 0 })
          const { checksum: webpsum, info: webpinfo } = await fileHandler.sharpWrite(webp)
          await registerResize(asset, w, webpsum, 'image/webp', 65, webpinfo.size)
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
