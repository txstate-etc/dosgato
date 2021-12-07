import { PrimaryKeyLoader } from 'dataloader-factory'
import { SiteService } from '../site'
import { DosGatoService } from '../util/authservice'
import { getAssetFolders } from './assetfolder.database'
import { AssetFolder } from './assetfolder.model'

const assetFolderByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => await getAssetFolders({ internalIds: ids }),
  extractId: af => af.internalId
})

export class AssetFolderService extends DosGatoService {
  async findByInternalId (id: number) {
    return await this.loaders.get(assetFolderByInternalIdLoader).load(id)
  }

  async getAncestors (folder: AssetFolder) {
    return await this.loaders.loadMany(assetFolderByInternalIdLoader, folder.pathSplit)
  }

  async getSite (folder: AssetFolder) {
    const ancestors = await this.getAncestors(folder)
    return await this.svc(SiteService).findByAssetRootId(ancestors[0].internalId)
  }

  async getPath (folder: AssetFolder) {
    const ancestors = await this.getAncestors(folder)
    return '/' + [...ancestors, folder].map(f => f.name).join('/')
  }

  async mayView () {
    return true
  }
}
