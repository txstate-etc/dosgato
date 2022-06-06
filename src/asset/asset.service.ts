import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { intersect, isNotNull, keyby } from 'txstate-utils'
import {
  Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes,
  SiteService, DosGatoService, getLatestDownload, AssetFolderServiceInternal, CreateAssetInput,
  createAsset, VersionedService, AssetResponse, FileSystemHandler, deleteAsset, undeleteAsset,
  moveAsset, popPath, basename
} from '../internal.js'

const assetsByIdLoader = new PrimaryKeyLoader({
  fetch: async (dataIds: string[]) => await getAssets({ ids: dataIds })
})

const assetsByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter: AssetFilter) => await getAssets({ ...filter, folderInternalIds }),
  keysFromFilter: (filter: AssetFilter | undefined) => filter?.folderInternalIds ?? [],
  extractKey: asset => asset.folderInternalId,
  idLoader: assetsByIdLoader
})

const resizesByAssetIdLoader = new ManyJoinedLoader({
  fetch: async (assetIds: string[]) => await getResizes(assetIds)
})

export class AssetServiceInternal extends BaseService {
  async find (filter: AssetFilter) {
    const assets = await getAssets(await this.processAssetFilters(filter))
    for (const asset of assets) this.loaders.get(assetsByIdLoader).prime(asset.id, asset)
    return assets
  }

  async findById (id: string) {
    return await this.loaders.get(assetsByIdLoader).load(id)
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
    return await this.loaders.get(resizesByAssetIdLoader).load(asset.id)
  }

  async getLatestDownload (asset: Asset) {
    const resizes = await this.getResizes(asset)
    return await getLatestDownload(asset, resizes.map(r => r.binaryId))
  }

  async create (args: CreateAssetInput) {
    const folder = await this.svc(AssetFolderService).findById(args.folderId)
    if (!folder) throw new Error('Specified folder does not exist')
    if (!(await this.haveAssetFolderPerm(folder, 'create'))) throw new Error(`Current user is not permitted to add assets to folder ${String(folder.name)}.`)
    try {
      await FileSystemHandler.moveToPermLocation(args.checksum)
      const versionedService = this.svc(VersionedService)
      const asset = await createAsset(versionedService, this.auth!.sub, args)
      this.loaders.clear()
      return new AssetResponse({ asset, success: true })
    } catch (err: any) {
      console.error(err)
      // TODO: Need to distinguish between errors that happen when moving the file and errors releated to the database
      throw new Error('Could not create asset')
    }
  }

  async move (dataId: string, folderId: string) {
    const [asset, folder] = await Promise.all([
      this.loaders.get(assetsByIdLoader).load(dataId),
      this.svc(AssetFolderService).findById(folderId)
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
