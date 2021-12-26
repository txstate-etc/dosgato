import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { AssetService } from '../asset'
import { DosGatoService } from '../util/authservice'
import { getAssetFolders } from './assetfolder.database'
import { AssetFolder } from './assetfolder.model'

const assetFolderByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => await getAssetFolders({ internalIds: ids }),
  extractId: af => af.internalId
})

const foldersByInternalIdPathLoader = new OneToManyLoader({
  fetch: async (internalIdPaths: string[]) => {
    return await getAssetFolders({ internalIdPaths })
  },
  extractKey: (f: AssetFolder) => f.path,
  idLoader: assetFolderByInternalIdLoader
})

const foldersByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[]) => {
    const pages = await getAssetFolders({ internalIdPathsRecursive })
    return pages
  },
  matchKey: (path: string, f: AssetFolder) => f.path.startsWith(path),
  idLoader: assetFolderByInternalIdLoader
})

export class AssetFolderService extends DosGatoService {
  async findByInternalId (id: number) {
    return await this.loaders.get(assetFolderByInternalIdLoader).load(id)
  }

  async getAncestors (folder: AssetFolder) {
    return await this.loaders.loadMany(assetFolderByInternalIdLoader, folder.pathSplit)
  }

  async getParent (folder: AssetFolder) {
    if (!folder.parentInternalId) return undefined
    return await this.loaders.get(assetFolderByInternalIdLoader).load(folder.parentInternalId)
  }

  async getChildFolders (folder: AssetFolder, recursive?: boolean) {
    const loader = recursive ? foldersByInternalIdPathRecursiveLoader : foldersByInternalIdPathLoader
    return await this.loaders.get(loader).load(`${folder.path}${folder.path === '/' ? '' : '/'}${folder.internalId}`)
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean) {
    if (recursive) {
      const folders = await this.getChildFolders(folder, true)
      return await this.svc(AssetService).findByFolders([...folders, folder])
    } else {
      return await this.svc(AssetService).findByFolder(folder)
    }
  }

  async getPath (folder: AssetFolder) {
    const ancestors = await this.getAncestors(folder)
    return '/' + [...ancestors, folder].map(f => f.name).join('/')
  }

  async mayView (folder: AssetFolder) {
    if (await this.haveAssetFolderPerm(folder, 'view')) return true
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const [folders, assets] = await Promise.all([
      this.getChildFolders(folder, true),
      this.getChildAssets(folder, true)
    ])
    for (const f of folders) {
      if (await this.haveAssetFolderPerm(f, 'view')) return true
    }
    for (const a of assets) {
      if (await this.haveAssetPerm(a, 'view')) return true
    }
    return false
  }

  async mayViewForEdit (folder: AssetFolder) {
    if (await this.haveAssetFolderPerm(folder, 'viewForEdit')) return true
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const [folders, assets] = await Promise.all([
      this.getChildFolders(folder, true),
      this.getChildAssets(folder, true)
    ])
    for (const f of folders) {
      if (await this.haveAssetFolderPerm(f, 'viewForEdit')) return true
    }
    for (const a of assets) {
      if (await this.haveAssetPerm(a, 'viewForEdit')) return true
    }
    return false
  }

  async mayCreate (folder: AssetFolder) {
    return await this.haveAssetFolderPerm(folder, 'create')
  }

  async mayMove (folder: AssetFolder) {
    return await this.haveAssetFolderPerm(folder, 'move')
  }

  async mayUpdate (folder: AssetFolder) {
    return await this.haveAssetFolderPerm(folder, 'update')
  }

  async mayDelete (folder: AssetFolder) {
    return await this.haveAssetFolderPerm(folder, 'delete')
  }

  async mayUndelete (folder: AssetFolder) {
    return await this.haveAssetFolderPerm(folder, 'undelete')
  }
}
