import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  AssetService, DosGatoService, getAssetFolders, AssetFolder, AssetServiceInternal,
  CreateAssetFolderInput, createAssetFolder, AssetFolderResponse, renameAssetFolder,
  moveAssetFolder, deleteAssetFolder, undeleteAssetFolder, AssetFilter, AssetFolderFilter, normalizePath, makeSafe
} from '../internal.js'
import { isNull, isNotNull, unique, mapConcurrent, intersect, isNotBlank, keyby, isBlank } from 'txstate-utils'

const assetFolderByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => await getAssetFolders({ internalIds: ids }),
  extractId: af => af.internalId
})

const assetFolderByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getAssetFolders({ ids }),
  idLoader: assetFolderByInternalIdLoader
})

assetFolderByInternalIdLoader.addIdLoader(assetFolderByIdLoader)

const foldersByNameLoader = new OneToManyLoader({
  fetch: async (names: string[]) => await getAssetFolders({ names }),
  extractKey: folder => folder.name,
  idLoader: [assetFolderByIdLoader, assetFolderByInternalIdLoader]
})

const foldersByInternalIdPathLoader = new OneToManyLoader({
  fetch: async (internalIdPaths: string[], filter: AssetFolderFilter) => {
    return await getAssetFolders({ ...filter, internalIdPaths })
  },
  keysFromFilter: (filter: AssetFolderFilter | undefined) => filter?.internalIdPaths ?? [],
  extractKey: (f: AssetFolder) => f.path,
  idLoader: [assetFolderByInternalIdLoader, assetFolderByIdLoader]
})

const foldersByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[], filter: AssetFolderFilter) => {
    const pages = await getAssetFolders({ ...filter, internalIdPathsRecursive })
    return pages
  },
  keysFromFilter: (filter: AssetFolderFilter | undefined) => filter?.internalIdPathsRecursive ?? [],
  matchKey: (path: string, f: AssetFolder) => f.path.startsWith(path),
  idLoader: [assetFolderByInternalIdLoader, assetFolderByIdLoader]
})

export class AssetFolderServiceInternal extends BaseService {
  async find (filter?: AssetFolderFilter) {
    const folders = await getAssetFolders(await this.processFolderFilters(filter))
    for (const folder of folders) {
      this.loaders.get(assetFolderByIdLoader).prime(folder.id, folder)
      this.loaders.get(assetFolderByInternalIdLoader).prime(folder.internalId, folder)
    }
    return folders
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(assetFolderByInternalIdLoader).load(id)
  }

  async findById (id: string) {
    return await this.loaders.get(assetFolderByIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(assetFolderByIdLoader, ids)
  }

  async getAncestors (folder: AssetFolder) {
    return await this.loaders.loadMany(assetFolderByInternalIdLoader, folder.pathSplit)
  }

  async getParent (folder: AssetFolder) {
    if (!folder.parentInternalId) return undefined
    return await this.loaders.get(assetFolderByInternalIdLoader).load(folder.parentInternalId)
  }

  async convertPathsToIDPaths (pathstrings: string[]) {
    const paths = pathstrings.map(normalizePath).map(p => p.split(/\//).filter(isNotBlank))
    const names = new Set<string>(paths.flat())
    const folders = await this.loaders.loadMany(foldersByNameLoader, Array.from(names))
    const rowsByNameAndIDPath: Record<string, Record<string, AssetFolder[]>> = {}
    for (const row of folders) {
      rowsByNameAndIDPath[row.name] ??= {}
      rowsByNameAndIDPath[row.name][row.path] ??= []
      rowsByNameAndIDPath[row.name][row.path].push(row)
    }
    const idpaths: string[] = []
    for (const pt of paths) {
      let searchpaths = ['/']
      for (const segment of pt) {
        const pages = searchpaths.flatMap(sp => rowsByNameAndIDPath[segment][sp])
        searchpaths = pages.map(pg => `${pg.path}${pg.path === '/' ? '' : '/'}${pg.internalId}`)
        if (!searchpaths.length) break
      }
      idpaths.push(...searchpaths)
    }
    return idpaths
  }

  async processFolderFilters (filter?: AssetFolderFilter) {
    if (filter?.parentOfFolderIds) {
      const folders = await this.loaders.loadMany(assetFolderByIdLoader, filter.parentOfFolderIds)
      const parentIds = folders.map(f => f.parentInternalId).filter(isNotNull)
      if (filter.internalIds?.length) {
        filter.internalIds.push(...parentIds)
        filter.internalIds = unique(filter.internalIds)
      } else filter.internalIds = parentIds
    }
    if (filter?.parentOfFolderInternalIds) {
      const folders = await this.loaders.loadMany(assetFolderByInternalIdLoader, filter.parentOfFolderInternalIds)
      const parentIds = folders.map(f => f.parentInternalId).filter(isNotNull)
      if (filter.internalIds?.length) {
        filter.internalIds.push(...parentIds)
        filter.internalIds = unique(filter.internalIds)
      } else filter.internalIds = parentIds
    }
    if (filter?.childOfFolderIds) {
      const folders = await this.loaders.loadMany(assetFolderByIdLoader, filter.childOfFolderIds)
      const childFolders = await (await mapConcurrent(folders, async (folder) => await this.getChildFolders(folder, false))).flat()
      if (filter.internalIds?.length) {
        filter.internalIds.push(...childFolders.map(f => f.internalId))
      } else filter.internalIds = childFolders.map(f => f.internalId)
    }

    // named paths e.g. /site1/about
    if (filter?.paths?.length) {
      const idpaths = await this.convertPathsToIDPaths(filter.paths)
      const ids = idpaths.map(p => +p.split(/\//).slice(-1)[0])
      filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, ids)
    }

    // beneath a named path e.g. /site1/about
    if (filter?.beneath?.length) {
      const idpaths = await this.convertPathsToIDPaths(filter.beneath)
      filter.internalIdPathsRecursive = intersect({ skipEmpty: true }, filter.internalIdPaths, idpaths)
    }

    // direct children of a named path e.g. /site1/about
    if (filter?.parentPaths?.length) {
      const idpaths = await this.convertPathsToIDPaths(filter.parentPaths)
      filter.internalIdPaths = intersect({ skipEmpty: true }, filter.internalIdPaths, idpaths)
    }

    if (filter?.links?.length) {
      const folders = await this.findByIds(filter.links.map(l => l.id))
      const foldersById = keyby(folders, 'id')
      const notFoundById = filter.links.filter(l => !foldersById[l.id])
      if (notFoundById.length) {
        const pathFolders = await this.find({ paths: notFoundById.map(l => l.path) })

        const foldersByPath: Record<string, AssetFolder> = {}
        await Promise.all(pathFolders.map(async a => {
          foldersByPath[await this.getPath(a)] = a
        }))
        folders.push(...notFoundById.map(link => foldersByPath[link.path]).filter(isNotNull))
      }
      if (!folders.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, folders.map(a => a.internalId))
    }

    return filter
  }

  async getChildFolders (folder: AssetFolder, recursive?: boolean, filter?: AssetFolderFilter) {
    const loader = recursive ? foldersByInternalIdPathRecursiveLoader : foldersByInternalIdPathLoader
    filter = await this.processFolderFilters(filter)
    return await this.loaders.get(loader, filter).load(`${folder.path}${folder.path === '/' ? '' : '/'}${folder.internalId}`)
  }

  async getChildFoldersByIDPaths (idpaths: string[]) {
    return await this.loaders.loadMany(foldersByInternalIdPathRecursiveLoader, idpaths)
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean, filter?: AssetFilter) {
    if (recursive) {
      const folders = await this.getChildFolders(folder, true)
      return await this.svc(AssetServiceInternal).findByFolders([...folders, folder], filter)
    } else {
      return await this.svc(AssetServiceInternal).findByFolder(folder, filter)
    }
  }

  async getPath (folder: AssetFolder) {
    const ancestors = await this.getAncestors(folder)
    return '/' + [...ancestors, folder].map(f => f.name).join('/')
  }
}

export class AssetFolderService extends DosGatoService<AssetFolder> {
  raw = this.svc(AssetFolderServiceInternal)

  async find (filter?: AssetFolderFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

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

  async getChildFolders (folder: AssetFolder, recursive?: boolean, filter?: AssetFolderFilter) {
    return await this.removeUnauthorized(await this.raw.getChildFolders(folder, recursive, filter))
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean, filter?: AssetFilter) {
    return await this.svc(AssetService).removeUnauthorized(await this.raw.getChildAssets(folder, recursive, filter))
  }

  async getPath (folder: AssetFolder) {
    return await this.raw.getPath(folder)
  }

  async create (args: CreateAssetFolderInput, validateOnly?: boolean) {
    const parentFolder = await this.loaders.get(assetFolderByIdLoader).load(args.parentId)
    if (!parentFolder) throw new Error('Parent folder does not exist.')
    if (!(await this.haveAssetFolderPerm(parentFolder, 'create'))) throw new Error(`Current user is not permitted to create folders in ${String(parentFolder.name)}.`)
    args.name = makeSafe(args.name)
    const resp = new AssetFolderResponse({ success: true })
    if (isBlank(args.name)) resp.addMessage('You must enter a folder name.', 'args.name')
    const [folders, assets] = await Promise.all([this.raw.getChildFolders(parentFolder, false, { names: [args.name] }), this.raw.getChildAssets(parentFolder, false, { names: [args.name] })])
    if (folders.length || assets.length) resp.addMessage('That name is already in use.', 'args.name')
    if (validateOnly || resp.hasErrors()) return resp
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
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be renamed does not exist')
    if (isNull(folder.parentInternalId)) throw new Error('Root asset folders cannot be renamed.')
    if (!(await this.haveAssetFolderPerm(folder, 'update'))) throw new Error(`Current user is not permitted to rename folder ${String(folder.name)}.`)
    try {
      await renameAssetFolder(folderId, name)
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
      this.raw.findById(folderId),
      this.raw.findById(targetFolderId)
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
    const folder = await this.raw.findById(folderId)
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
    const folder = await this.raw.findById(folderId)
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
