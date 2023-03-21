import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { isNull, isNotNull, unique, mapConcurrent, intersect, isBlank, someAsync, filterAsync } from 'txstate-utils'
import {
  AssetService, DosGatoService, getAssetFolders, AssetFolder, AssetServiceInternal,
  CreateAssetFolderInput, createAssetFolder, AssetFolderResponse, renameAssetFolder,
  deleteAssetFolder, undeleteAssetFolder, AssetFilter, AssetFolderFilter,
  finalizeAssetFolderDeletion, DeleteStateAll, PagetreeServiceInternal, PagetreeType, SiteServiceInternal, getAssetFoldersByPath, NameConflictError
} from '../internal.js'

const assetFolderByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getAssetFolders({ ids, deleteStates: DeleteStateAll })
})

const foldersByNameLoader = new OneToManyLoader({
  fetch: async (names: string[]) => await getAssetFolders({ names, deleteStates: DeleteStateAll }),
  extractKey: folder => folder.name,
  idLoader: assetFolderByIdLoader
})

const foldersByLinkIdLoader = new OneToManyLoader({
  fetch: async (linkIds: string[], filters: AssetFolderFilter) => {
    return await getAssetFolders({ ...filters, linkIds })
  },
  extractKey: f => f.linkId,
  idLoader: assetFolderByIdLoader
})

const foldersByPathLoader = new ManyJoinedLoader({
  fetch: async (paths: string[], filters: AssetFolderFilter) => {
    return await getAssetFoldersByPath(paths, filters)
  },
  idLoader: assetFolderByIdLoader
})

const foldersByInternalIdPathLoader = new OneToManyLoader({
  fetch: async (internalIdPaths: string[], filter: AssetFolderFilter) => {
    return await getAssetFolders({ ...filter, internalIdPaths })
  },
  keysFromFilter: (filter: AssetFolderFilter | undefined) => filter?.internalIdPaths ?? [],
  extractKey: (f: AssetFolder) => f.path,
  idLoader: assetFolderByIdLoader
})

const foldersByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[], filter: AssetFolderFilter) => {
    const pages = await getAssetFolders({ ...filter, internalIdPathsRecursive })
    return pages
  },
  keysFromFilter: (filter: AssetFolderFilter | undefined) => filter?.internalIdPathsRecursive ?? [],
  matchKey: (path: string, f: AssetFolder) => f.path.startsWith(path),
  idLoader: assetFolderByIdLoader
})

const foldersInPagetreeLoader = new OneToManyLoader({
  fetch: async (pagetreeIds: string[], filter?: AssetFolderFilter) => {
    return await getAssetFolders({ ...filter, pagetreeIds })
  },
  extractKey: (f: AssetFolder) => f.pagetreeId,
  keysFromFilter: (filter: AssetFolderFilter | undefined) => filter?.pagetreeIds ?? [],
  idLoader: assetFolderByIdLoader
})

export class AssetFolderServiceInternal extends BaseService {
  async find (filter?: AssetFolderFilter) {
    const folders = await getAssetFolders(await this.processFolderFilters(filter))
    for (const folder of folders) {
      this.loaders.get(assetFolderByIdLoader).prime(folder.id, folder)
    }
    return folders
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(assetFolderByIdLoader).load(String(id))
  }

  async findById (id: string) {
    return await this.loaders.get(assetFolderByIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(assetFolderByIdLoader, ids)
  }

  async findByInternalIds (ids: number[]) {
    return await this.findByIds(ids.map(String))
  }

  async findByPagetreeId (id: string, filter?: AssetFolderFilter) {
    return await this.loaders.get(foldersInPagetreeLoader, filter).load(id)
  }

  async getAncestors (folder: AssetFolder) {
    return await this.findByInternalIds(folder.pathSplit)
  }

  async getParent (folder: AssetFolder) {
    if (!folder.parentInternalId) return undefined
    return await this.findByInternalId(folder.parentInternalId)
  }

  async processFolderFilters (filter?: AssetFolderFilter) {
    if (!filter) return filter

    if (filter.parentOfFolderIds?.length) {
      const folders = await this.loaders.loadMany(assetFolderByIdLoader, filter.parentOfFolderIds)
      const parentIds = folders.map(f => f.parentInternalId).filter(isNotNull)
      if (filter.internalIds?.length) {
        filter.internalIds.push(...parentIds)
        filter.internalIds = unique(filter.internalIds)
      } else filter.internalIds = parentIds
    }
    if (filter.parentOfFolderInternalIds?.length) {
      const folders = await this.findByInternalIds(filter.parentOfFolderInternalIds)
      const parentIds = folders.map(f => f.parentInternalId).filter(isNotNull)
      if (filter.internalIds?.length) {
        filter.internalIds.push(...parentIds)
        filter.internalIds = unique(filter.internalIds)
      } else filter.internalIds = parentIds
    }
    if (filter.childOfFolderIds?.length) {
      const folders = await this.loaders.loadMany(assetFolderByIdLoader, filter.childOfFolderIds)
      const childFolders = await (await mapConcurrent(folders, async (folder) => await this.getChildFolders(folder, false))).flat()
      if (filter.internalIds?.length) {
        filter.internalIds.push(...childFolders.map(f => f.internalId))
      } else filter.internalIds = childFolders.map(f => f.internalId)
    }

    if (filter.links?.length) {
      const pagetreeSvc = this.svc(PagetreeServiceInternal)
      const siteSvc = this.svc(SiteServiceInternal)
      const folders = await Promise.all(filter.links.map(async l => {
        const lookups: Promise<AssetFolder[]>[] = []
        const [contextPagetree, targetSite] = await Promise.all([
          l.context ? pagetreeSvc.findById(l.context.pagetreeId) : undefined,
          siteSvc.findById(l.siteId)
        ])
        if (contextPagetree?.siteId === l.siteId) {
          // the link is targeting the same site as the context, so we need to look for the link in
          // the same pagetree as the context
          // if we don't find the link in our pagetree, we do NOT fall back to the primary page tree,
          // we WANT the user to see a broken link in their sandbox because it will break when they go live
          lookups.push(
            this.loaders.get(foldersByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            this.loaders.get(foldersByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/[^/]+/, `/${contextPagetree.name}`))
          )
        } else {
          // the link is cross-site, so we only look in the primary tree in the site the link was targeting
          // we do NOT fall back to finding the linkId in other sites that the link did not originally
          // point at
          // this means that links will break when pages are moved between sites, which is unfortunate but
          // ignoring the link's siteId leads to madness because we could have multiple sites that all have
          // pages with the same linkId, and now I have to try to pick: do I prefer launched sites? published
          // pages? etc
          const resolvedTargetSite = targetSite ?? await siteSvc.findByName(l.path.split('/')[1])
          if (!resolvedTargetSite || resolvedTargetSite.deleted) return undefined
          const lookuppath = l.path.replace(/^\/[^/]+/, `/${resolvedTargetSite?.name}`)
          lookups.push(
            this.loaders.get(foldersByLinkIdLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.linkId),
            this.loaders.get(foldersByPathLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.path)
          )
        }
        const pages = await Promise.all(lookups)
        return pages.find(p => p.length > 0)?.[0]
      }))
      const found = folders.filter(isNotNull)
      if (!found.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, found.map(p => p.internalId))
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

  async postFilter (folders: AssetFolder[], filter?: AssetFolderFilter) {
    return filter?.viewForEdit ? await filterAsync(folders, async f => await this.mayViewForEdit(f)) : folders
  }

  async find (filter?: AssetFolderFilter) {
    const [folders] = await Promise.all([
      this.postFilter(await this.removeUnauthorized(await this.raw.find(filter)), filter),
      this.currentAssetRules()
    ])
    return folders
  }

  async findByInternalId (internalId: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByPagetreeId (id: string, filter?: AssetFolderFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.findByPagetreeId(id, filter)), filter)
  }

  async getAncestors (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.getAncestors(folder))
  }

  async getParent (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.getParent(folder))
  }

  async getChildFolders (folder: AssetFolder, recursive?: boolean, filter?: AssetFolderFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.getChildFolders(folder, recursive, filter)), filter)
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean, filter?: AssetFilter) {
    return await this.svc(AssetService).postFilter(await this.svc(AssetService).removeUnauthorized(await this.raw.getChildAssets(folder, recursive, filter)), filter)
  }

  async getPath (folder: AssetFolder) {
    return await this.raw.getPath(folder)
  }

  async create (args: CreateAssetFolderInput, validateOnly?: boolean) {
    const parentFolder = await this.raw.findById(args.parentId)
    if (!parentFolder) throw new Error('Parent folder does not exist.')
    if (!(await this.haveAssetFolderPerm(parentFolder, 'create'))) throw new Error(`You are not permitted to create folders in ${String(parentFolder.name)}.`)

    const resp = new AssetFolderResponse({ success: true })
    if (isBlank(args.name)) resp.addMessage('You must enter a folder name.', 'args.name')
    const [folders, assets] = await Promise.all([this.raw.getChildFolders(parentFolder, false, { names: [args.name] }), this.raw.getChildAssets(parentFolder, false, { names: [args.name] })])
    if (folders.length || assets.length) resp.addMessage('That name is already in use.', 'args.name')
    if (validateOnly || resp.hasErrors()) return resp

    try {
      const assetfolder = await createAssetFolder(args)
      this.loaders.clear()
      resp.assetFolder = assetfolder
      return resp
    } catch (e: any) {
      if (e instanceof NameConflictError) {
        resp.addMessage('That name is already in use.', 'args.name')
        return resp
      }
      throw e
    }
  }

  async rename (folderId: string, name: string, validateOnly?: boolean) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be renamed does not exist.')
    if (isNull(folder.parentInternalId)) throw new Error('Root asset folders cannot be renamed.')
    if (!(await this.haveAssetFolderPerm(folder, 'update'))) throw new Error(`You are not permitted to rename folder ${String(folder.name)}.`)

    const resp = new AssetFolderResponse({ success: true })
    if (isBlank(name)) resp.addMessage('You must enter a folder name.', 'name')
    const parent = await this.raw.findByInternalId(folder.parentInternalId)
    if (!parent) throw new Error('Folder has a non-existing parent.')
    const [folders, assets] = await Promise.all([this.raw.getChildFolders(parent, false, { names: [name] }), this.raw.getChildAssets(parent, false, { names: [name] })])
    if (folders.some(f => f.internalId !== folder.internalId) || assets.length) resp.addMessage('That name is already in use.', 'name')
    if (validateOnly || resp.hasErrors()) return resp

    try {
      await renameAssetFolder(folderId, name)
      this.loaders.clear()
      const updatedFolder = await this.raw.findById(folderId)
      resp.assetFolder = updatedFolder
      return resp
    } catch (e: any) {
      if (e instanceof NameConflictError) {
        resp.addMessage('That name is already in use.', 'name')
      }
      throw e
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

  async finalizeDeletion (folderId: string) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be deleted does not exist')
    if (!(await this.haveAssetFolderPerm(folder, 'delete'))) throw new Error(`Current user is not permitted to delete folder ${String(folder.name)}.`)
    const currentUser = await this.currentUser()
    await finalizeAssetFolderDeletion(folder.internalId, currentUser!.internalId)
    this.loaders.clear()
    const deletedfolder = await this.raw.findById(folderId)
    return new AssetFolderResponse({ assetFolder: deletedfolder, success: true })
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
    // if we are able to view any child folders, we have to be able to view the ancestors so that we can draw the tree
    const rules = await this.currentAssetRules()
    if (!rules.some(r => r.path !== '/' && (!r.siteId || r.siteId === folder.siteId))) return false
    const [folders, assets] = await Promise.all([
      this.raw.getChildFolders(folder, true),
      this.raw.getChildAssets(folder, true)
    ])
    const [folderPass, assetPass] = await Promise.all([
      someAsync(folders, async f => await this.haveAssetFolderPerm(f, 'view')),
      someAsync(assets, async a => await this.haveAssetPerm(a, 'view'))
    ])
    return folderPass || assetPass
  }

  async mayViewForEdit (folder: AssetFolder) {
    if (await this.haveAssetFolderPerm(folder, 'viewForEdit')) return true
    // if we are able to view any child folders, we have to be able to view the ancestors so that we can draw the tree
    const rules = await this.currentAssetRules()
    if (!rules.some(r => r.path !== '/' && (!r.siteId || r.siteId === folder.siteId))) return false
    const [folders, assets] = await Promise.all([
      this.raw.getChildFolders(folder, true),
      this.raw.getChildAssets(folder, true)
    ])
    const [folderPass, assetPass] = await Promise.all([
      someAsync(folders, async f => await this.haveAssetFolderPerm(f, 'viewForEdit')),
      someAsync(assets, async a => await this.haveAssetPerm(a, 'viewForEdit'))
    ])
    return folderPass || assetPass
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
