import { ManyJoinedLoader, OneToManyLoader } from 'dataloader-factory'
import { Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes, SiteService, DosGatoService } from 'internal'

const assetsByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[]) => await getAssets({ folderInternalIds }),
  extractKey: asset => asset.folderInternalId
})

const resizesByAssetIdLoader = new ManyJoinedLoader({
  fetch: async (assetIds: string[]) => await getResizes(assetIds)
})

export class AssetService extends DosGatoService {
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
    const folder = await this.svc(AssetFolderService).findByInternalId(asset.folderInternalId)
    if (!folder) return []
    return [...await this.svc(AssetFolderService).getAncestors(folder), folder]
  }

  async getSite (asset: Asset) {
    const ancestors = await this.getAncestors(asset)
    return await this.svc(SiteService).findByAssetRootId(ancestors[0].internalId)
  }

  async getPath (asset: Asset) {
    const folder = await this.svc(AssetFolderService).findByInternalId(asset.folderInternalId)
    if (!folder) return '/'
    return appendPath(await this.svc(AssetFolderService).getPath(folder), asset.name as string)
  }

  async getResizes (asset: Asset) {
    return await this.loaders.get(resizesByAssetIdLoader).load(asset.id)
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
