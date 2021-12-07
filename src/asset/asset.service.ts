import { AuthorizedService } from '@txstate-mws/graphql-server'
import { Asset, AssetFilter } from './asset.model'
import { getAssets } from './asset.database'
import { AssetFolderService } from '../assetfolder'
import { appendPath } from '../util'
import { SiteService } from '../site'

export class AssetService extends AuthorizedService {
  async find (filter: AssetFilter) {
    return await getAssets(filter)
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

  async mayView (asset: Asset): Promise<boolean> {
    return true
  }
}
