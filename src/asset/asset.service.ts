import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader } from 'dataloader-factory'
import {
  Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes,
  SiteService, DosGatoService, getLatestDownload, AssetFolderServiceInternal, CreateAssetInput,
  createAsset, VersionedService, AssetResponse, FileSystemHandler
} from 'internal'

const assetsByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[]) => await getAssets({ folderInternalIds }),
  extractKey: asset => asset.folderInternalId
})

const resizesByAssetIdLoader = new ManyJoinedLoader({
  fetch: async (assetIds: string[]) => await getResizes(assetIds)
})

export class AssetServiceInternal extends BaseService {
  async find (filter: AssetFilter) {
    return await getAssets(filter)
  }

  async findByFolder (folder: AssetFolder) {
    return await this.loaders.get(assetsByFolderInternalIdLoader).load(folder.internalId)
  }

  async findByFolders (folders: AssetFolder[]) {
    return await this.loaders.loadMany(assetsByFolderInternalIdLoader, folders.map(f => f.internalId))
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
      const asset = await createAsset(versionedService, this.auth!.login, args)
      this.loaders.clear()
      return new AssetResponse({ asset, success: true })
    } catch (err: any) {
      console.error(err)
      // TODO: Need to distinguish between errors that happen when moving the file and errors releated to the database
      throw new Error('Could not create asset')
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
