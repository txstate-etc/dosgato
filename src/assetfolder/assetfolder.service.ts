import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  AssetService, DosGatoService, getAssetFolders, AssetFolder, AssetServiceInternal,
  CreateAssetFolderInput, createAssetFolder, AssetFolderResponse, renameAssetFolder,
  moveAssetFolder, deleteAssetFolder, undeleteAssetFolder
} from 'internal'
import { isNull } from 'txstate-utils'

const assetFolderByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => await getAssetFolders({ internalIds: ids }),
  extractId: af => af.internalId
})

const assetFolderByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getAssetFolders({ ids }),
  idLoader: assetFolderByInternalIdLoader
})

assetFolderByInternalIdLoader.addIdLoader(assetFolderByIdLoader)

const foldersByInternalIdPathLoader = new OneToManyLoader({
  fetch: async (internalIdPaths: string[]) => {
    return await getAssetFolders({ internalIdPaths })
  },
  extractKey: (f: AssetFolder) => f.path,
  idLoader: [assetFolderByInternalIdLoader, assetFolderByIdLoader]
})

const foldersByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[]) => {
    const pages = await getAssetFolders({ internalIdPathsRecursive })
    return pages
  },
  matchKey: (path: string, f: AssetFolder) => f.path.startsWith(path),
  idLoader: [assetFolderByInternalIdLoader, assetFolderByIdLoader]
})

export class AssetFolderServiceInternal extends BaseService {
  async findByInternalId (id: number) {
    return await this.loaders.get(assetFolderByInternalIdLoader).load(id)
  }

  async findById (id: string) {
    return await this.loaders.get(assetFolderByIdLoader).load(id)
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
      return await this.svc(AssetServiceInternal).findByFolders([...folders, folder])
    } else {
      return await this.svc(AssetServiceInternal).findByFolder(folder)
    }
  }

  async getPath (folder: AssetFolder) {
    const ancestors = await this.getAncestors(folder)
    return '/' + [...ancestors, folder].map(f => f.name).join('/')
  }
}

export class AssetFolderService extends DosGatoService<AssetFolder> {
  raw = this.svc(AssetFolderServiceInternal)

  async findByInternalId (internalId: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async getAncestors (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.getAncestors(folder))
  }

  async getParent (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.getParent(folder))
  }

  async getChildFolders (folder: AssetFolder, recursive?: boolean) {
    return await this.removeUnauthorized(await this.raw.getChildFolders(folder, recursive))
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean) {
    await this.svc(AssetService).removeUnauthorized(await this.raw.getChildAssets(folder, recursive))
  }

  async getPath (folder: AssetFolder) {
    return await this.raw.getPath(folder)
  }

  async create (args: CreateAssetFolderInput) {
    const parentFolder = await this.loaders.get(assetFolderByIdLoader).load(args.parentId)
    if (!parentFolder) throw new Error('Parent folder does not exist.')
    if (!(await this.haveAssetFolderPerm(parentFolder, 'create'))) throw new Error(`Current user is not permitted to create folders in ${String(parentFolder.name)}.`)
    try {
      const assetfolder = await createAssetFolder(args)
      this.loaders.clear()
      return new AssetFolderResponse({ assetFolder: assetfolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not create asset folder')
    }
  }

  async rename (folderId: string, name: string) {
    const folder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
    if (!folder) throw new Error('Folder to be renamed does not exist')
    if (isNull(folder.parentInternalId)) throw new Error('Root asset folders cannot be renamed.')
    if (!(await this.haveAssetFolderPerm(folder, 'update'))) throw new Error(`Current user is not permitted to rename folder ${String(folder.name)}.`)
    try {
      await renameAssetFolder(folder.internalId, name)
      this.loaders.clear()
      const updatedFolder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
      return new AssetFolderResponse({ assetFolder: updatedFolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not rename asset folder')
    }
  }

  async move (folderId: string, targetFolderId: string) {
    const [folder, targetFolder] = await Promise.all([
      this.loaders.get(assetFolderByIdLoader).load(folderId),
      this.loaders.get(assetFolderByIdLoader).load(targetFolderId)
    ])
    if (!folder) throw new Error('Folder to be moved does not exist')
    if (!targetFolder) throw new Error('Target folder does not exist')
    if (isNull(folder.parentInternalId)) throw new Error('Root asset folders cannot be moved.')
    if (targetFolder.path.startsWith(`${folder.path}/${folder.internalId}`)) throw new Error('Cannot move an asset folder into its own subtree')
    if (!(await this.haveAssetFolderPerm(folder, 'move'))) throw new Error(`Current user is not permitted to move folder ${String(folder.name)}.`)
    if (!(await this.haveAssetFolderPerm(targetFolder, 'create'))) throw new Error(`Current user is not permitted to move folders to folder ${String(targetFolder.name)}.`)
    try {
      await moveAssetFolder(folder.internalId, targetFolder)
      this.loaders.clear()
      const movedFolder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
      return new AssetFolderResponse({ assetFolder: movedFolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not move asset folder')
    }
  }

  async delete (folderId: string) {
    const folder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
    if (!folder) throw new Error('Folder to be deleted does not exist')
    if (isNull(folder.parentInternalId)) throw new Error('Root asset folders cannot be deleted.')
    if (!(await this.haveAssetFolderPerm(folder, 'delete'))) throw new Error(`Current user is not permitted to delete folder ${String(folder.name)}.`)
    const currentUser = await this.currentUser()
    try {
      await deleteAssetFolder(folder.internalId, currentUser!.internalId)
      this.loaders.clear()
      const deletedfolder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
      return new AssetFolderResponse({ assetFolder: deletedfolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not delete asset folder')
    }
  }

  async undelete (folderId: string) {
    const folder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
    if (!folder) throw new Error('Folder to be restored does not exist')
    if (!(await this.haveAssetFolderPerm(folder, 'undelete'))) throw new Error(`Current user is not permitted to restore folder ${String(folder.name)}.`)
    try {
      await undeleteAssetFolder(folder.internalId)
      this.loaders.clear()
      const restoredfolder = await this.loaders.get(assetFolderByIdLoader).load(folderId)
      return new AssetFolderResponse({ assetFolder: restoredfolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not restore asset folder')
    }
  }

  async mayView (folder: AssetFolder) {
    if (await this.haveAssetFolderPerm(folder, 'view')) return true
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const [folders, assets] = await Promise.all([
      this.raw.getChildFolders(folder, true),
      this.raw.getChildAssets(folder, true)
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
      this.raw.getChildFolders(folder, true),
      this.raw.getChildAssets(folder, true)
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
