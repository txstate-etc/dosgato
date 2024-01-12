import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { isNull, isNotNull, intersect, isBlank, sortby } from 'txstate-utils'
import {
  AssetService, DosGatoService, getAssetFolders, type AssetFolder, AssetServiceInternal,
  type CreateAssetFolderInput, createAssetFolder, AssetFolderResponse, renameAssetFolder,
  deleteAssetFolder, undeleteAssetFolder, type AssetFilter, type AssetFolderFilter,
  finalizeAssetFolderDeletion, DeleteStateAll, PagetreeServiceInternal, PagetreeType,
  SiteServiceInternal, getAssetFoldersByPath, NameConflictError, AssetRuleService, DeleteState,
  SiteRuleService, LaunchState
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

    if (filter.links?.length) {
      const pagetreeSvc = this.svc(PagetreeServiceInternal)
      const siteSvc = this.svc(SiteServiceInternal)
      const folders = await Promise.all(filter.links.map(async l => {
        const lookups: Promise<(AssetFolder | undefined)[]>[] = []
        const [contextPagetree, targetSite] = await Promise.all([
          l.context ? pagetreeSvc.findById(l.context.pagetreeId) : undefined,
          siteSvc.findById(l.siteId)
        ])
        if (contextPagetree) {
          // always look to see if the link might be targeting something in the context pagetree, in case
          // pages and their assets were copied together to another site.
          // if we don't find the link in our pagetree, we do NOT fall back to the primary page tree,
          // we WANT the user to see a broken link in their sandbox because it will break when they go live
          lookups.push(
            this.loaders.get(foldersByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            this.loaders.get(foldersByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/[^/]+/, `/${contextPagetree.name}`))
          )
        }
        if (contextPagetree?.siteId !== l.siteId) {
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
            this.loaders.get(foldersByLinkIdLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId], launchStates: [LaunchState.LAUNCHED, LaunchState.PRELAUNCH] }).load(l.linkId),
            this.loaders.get(foldersByPathLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId], launchStates: [LaunchState.LAUNCHED, LaunchState.PRELAUNCH] }).load(lookuppath)
          )
        }
        const folders = await Promise.all(lookups)
        return sortby(folders.flat().filter(isNotNull), f => f.siteId === contextPagetree?.siteId, true)[0]
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

  postFilter (folders: AssetFolder[], filter?: AssetFolderFilter) {
    return filter?.viewForEdit ? folders.filter(f => this.mayViewForEdit(f)) : folders
  }

  async find (filter?: AssetFolderFilter) {
    const folders = await this.raw.find(filter)
    if (filter?.links?.length || filter?.paths?.length || filter?.ids?.length) return folders.filter(f => this.mayViewIndividual(f))
    return this.postFilter(this.removeUnauthorized(folders), filter)
  }

  async findByInternalId (internalId: number) {
    return this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByPagetreeId (id: string, filter?: AssetFolderFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByPagetreeId(id, filter)), filter)
  }

  async getAncestors (folder: AssetFolder) {
    return this.removeUnauthorized(await this.raw.getAncestors(folder))
  }

  async getParent (folder: AssetFolder) {
    return this.removeUnauthorized(await this.raw.getParent(folder))
  }

  async getChildFolders (folder: AssetFolder, recursive?: boolean, filter?: AssetFolderFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.getChildFolders(folder, recursive, filter)), filter)
  }

  async getChildAssets (folder: AssetFolder, recursive?: boolean, filter?: AssetFilter) {
    return await this.svc(AssetService).postFilter(this.svc(AssetService).removeUnauthorized(await this.raw.getChildAssets(folder, recursive, filter)), filter)
  }

  async getPath (folder: AssetFolder) {
    return await this.raw.getPath(folder)
  }

  async create (args: CreateAssetFolderInput, validateOnly?: boolean) {
    const parentFolder = await this.raw.findById(args.parentId)
    if (!parentFolder) throw new Error('Parent folder does not exist.')
    if (!this.haveAssetFolderPerm(parentFolder, 'create')) throw new Error(`You are not permitted to create folders in ${String(parentFolder.name)}.`)

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
    if (!this.haveAssetFolderPerm(folder, 'update')) throw new Error(`You are not permitted to rename folder ${String(folder.name)}.`)

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
    if (!this.haveAssetFolderPerm(folder, 'delete')) throw new Error(`Current user is not permitted to delete folder ${String(folder.name)}.`)
    try {
      await deleteAssetFolder(folder.internalId, this.ctx.authInfo.user!.internalId)
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
    if (!this.haveAssetFolderPerm(folder, 'delete')) throw new Error(`Current user is not permitted to delete folder ${String(folder.name)}.`)
    await finalizeAssetFolderDeletion(folder.internalId, this.ctx.authInfo.user!.internalId)
    this.loaders.clear()
    const deletedfolder = await this.raw.findById(folderId)
    return new AssetFolderResponse({ assetFolder: deletedfolder, success: true })
  }

  async undelete (folderId: string) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be restored does not exist')
    if (!this.mayUndelete(folder)) throw new Error(`Current user is not permitted to restore folder ${String(folder.name)}.`)
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

  mayView (folder: AssetFolder) {
    if (folder.orphaned) {
      return this.ctx.authInfo.siteRules.some(r => r.grants.delete && SiteRuleService.applies(r, folder.siteId))
    }
    for (const r of this.ctx.authInfo.assetRules) {
      if (!r.grants.view) continue
      if (!AssetRuleService.appliesToPagetree(r, folder)) continue
      if (folder.deleteState === DeleteState.DELETED && !r.grants.undelete) continue
      if (folder.deleteState === DeleteState.MARKEDFORDELETE && !r.grants.delete) continue
      if (AssetRuleService.appliesToPath(r, folder.resolvedPathWithoutSitename)) return true
      if (AssetRuleService.appliesToChildOfPath(r, folder.resolvedPathWithoutSitename)) return true
      if (AssetRuleService.appliesToParentOfPath(r, folder.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  // may view the folder if requested individually
  mayViewIndividual (folder: AssetFolder) {
    return (folder.pagetreeType === PagetreeType.PRIMARY && !folder.orphaned && folder.deleteState === DeleteState.NOTDELETED) || this.mayView(folder)
  }

  mayViewForEdit (folder: AssetFolder) {
    return this.mayView(folder)
  }

  mayCreate (folder: AssetFolder) {
    return this.haveAssetFolderPerm(folder, 'create')
  }

  mayMove (folder: AssetFolder) {
    return this.haveAssetFolderPerm(folder, 'move')
  }

  mayUpdate (folder: AssetFolder) {
    return this.haveAssetFolderPerm(folder, 'update')
  }

  mayDelete (folder: AssetFolder) {
    return this.haveAssetFolderPerm(folder, 'delete')
  }

  mayUndelete (folder: AssetFolder) {
    if (folder.deleteState === DeleteState.NOTDELETED || folder.orphaned) return false
    return folder.deleteState === DeleteState.MARKEDFORDELETE ? this.haveAssetFolderPerm(folder, 'delete') : this.haveAssetFolderPerm(folder, 'undelete')
  }
}
