import { AuthorizedService } from '@txstate-mws/graphql-server'
import { Asset, AssetFilter } from './asset.model'
import { getAssets } from './asset.database'

export class AssetService extends AuthorizedService {
  async find (filter: AssetFilter) {
    return await getAssets(filter)
  }

  async mayView (asset: Asset): Promise<boolean> {
    return true
  }
}
