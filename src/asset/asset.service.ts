import { BaseService, type Context, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { intersect, isBlank, isNotNull, sortby } from 'txstate-utils'
import {
  type Asset, type AssetFilter, getAssets, type AssetFolder, AssetFolderService, appendPath, getResizes,
  DosGatoService, getLatestDownload, AssetFolderServiceInternal, AssetResponse,
  deleteAsset, undeleteAssets, getResizesById, VersionedService, getDownloads, type DownloadsFilter,
  getResizeDownloads, type AssetResize, AssetFolderResponse, moveAssets, copyAssets, finalizeAssetDeletion,
  renameAsset, updateAssetMeta, SiteServiceInternal, PagetreeServiceInternal, DeleteStateAll,
  getAssetsByPath, PagetreeType, SiteRuleService, DeleteState, AssetRuleService, fileHandler,
  LaunchState, deleteAssets, AssetsResponse, templateRegistry
} from '../internal.js'

const thumbnailMimes = new Set(['image/jpg', 'image/jpeg', 'image/gif', 'image/png'])

const assetsByIdLoader = new PrimaryKeyLoader({
  fetch: async (dataIds: string[]) => await getAssets({ ids: dataIds, deleteStates: DeleteStateAll })
})

const assetsByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => await getAssets({ internalIds, deleteStates: DeleteStateAll }),
  extractId: asset => asset.internalId,
  idLoader: assetsByIdLoader
})
assetsByIdLoader.addIdLoader(assetsByInternalIdLoader)

const assetsByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter: AssetFilter) => await getAssets({ ...filter, folderInternalIds }),
  keysFromFilter: (filter: AssetFilter | undefined) => filter?.folderInternalIds ?? [],
  extractKey: asset => asset.folderInternalId,
  idLoader: [assetsByIdLoader, assetsByInternalIdLoader]
})

const assetsByChecksumLoader = new OneToManyLoader({
  fetch: async (checksums: string[], filter: AssetFilter) => await getAssets({ ...filter, checksums }),
  keysFromFilter: (filter: AssetFilter | undefined) => filter?.checksums ?? [],
  extractKey: asset => asset.checksum,
  idLoader: [assetsByIdLoader, assetsByInternalIdLoader]
})

const assetsByLinkIdLoader = new OneToManyLoader({
  fetch: async (linkIds: string[], filters: AssetFilter) => {
    return await getAssets({ ...filters, linkIds })
  },
  extractKey: a => a.linkId,
  idLoader: [assetsByIdLoader, assetsByInternalIdLoader]
})

const assetsByPathLoader = new ManyJoinedLoader({
  fetch: async (paths: string[], filters: AssetFilter, ctx: Context) => {
    return await getAssetsByPath(paths, filters, ctx)
  },
  idLoader: [assetsByIdLoader, assetsByInternalIdLoader]
})

const resizesByAssetIdLoader = new ManyJoinedLoader({
  fetch: async (assetInternalIds: number[]) => await getResizes(assetInternalIds)
})

const resizeLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getResizesById(ids)
})

const downloadsByAssetIdLoader = new OneToManyLoader({
  fetch: async (assetIds: string[], filter: DownloadsFilter) => await getDownloads(assetIds, filter),
  extractKey: dr => dr.relatedId
})

const downloadsByResizeIdLoader = new OneToManyLoader({
  fetch: async (resizeIds: string[], filter: DownloadsFilter) => await getResizeDownloads(resizeIds, filter),
  extractKey: dr => dr.relatedId
})

const primaryOrSandbox: Record<PagetreeType, boolean> = { [PagetreeType.SANDBOX]: true, [PagetreeType.PRIMARY]: true, [PagetreeType.ARCHIVE]: false }

export class AssetServiceInternal extends BaseService {
  async find (filter: AssetFilter) {
    const assets = await getAssets(await this.processAssetFilters(filter))
    for (const asset of assets) this.loaders.get(assetsByIdLoader).prime(asset.id, asset)
    return assets
  }

  async findById (id: string) {
    return await this.loaders.get(assetsByIdLoader).load(id)
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(assetsByInternalIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(assetsByIdLoader, ids)
  }

  async findByLinkIds (linkIds: string[]) {
    return await this.loaders.loadMany(assetsByLinkIdLoader, linkIds)
  }

  async findByFolder (folder: AssetFolder, filter?: AssetFilter) {
    return await this.findByFolderInternalId(folder.internalId, filter)
  }

  async findByFolderInternalId (folderInternalId: number, filter?: AssetFilter) {
    filter = await this.processAssetFilters(filter)
    return await this.loaders.get(assetsByFolderInternalIdLoader, filter).load(folderInternalId)
  }

  async findByFolders (folders: AssetFolder[], filter?: AssetFilter) {
    filter = await this.processAssetFilters(filter)
    return await this.loaders.loadMany(assetsByFolderInternalIdLoader, folders.map(f => f.internalId), filter)
  }

  async getAncestors (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    if (!folder) return []
    return [...await this.svc(AssetFolderServiceInternal).getAncestors(folder), folder]
  }

  async getSite (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    return await this.svc(SiteServiceInternal).findById(folder!.siteId)
  }

  async getPagetree (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    return await this.svc(PagetreeServiceInternal).findById(folder!.pagetreeId)
  }

  async getPath (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    if (!folder) return '/'
    return appendPath(await this.svc(AssetFolderServiceInternal).getPath(folder), asset.name as string)
  }

  async getData (asset: Asset, version?: number) {
    return (await this.svc(VersionedService).get(asset.intDataId, { version }))!.data
  }

  async processAssetFilters (filter?: AssetFilter) {
    if (filter?.legacyIds?.length) {
      const ids = await this.svc(VersionedService).find([{ indexName: 'legacyId', in: filter.legacyIds }], 'asset')
      filter.ids = intersect({ skipEmpty: true }, filter.ids, ids)
      if (!filter.ids.length) filter.internalIds = [-1]
    }

    if (filter?.links?.length) {
      const pagetreeSvc = this.svc(PagetreeServiceInternal)
      const siteSvc = this.svc(SiteServiceInternal)
      const pages = await Promise.all(filter.links.map(async l => {
        const lookups: Promise<(Asset | undefined)[]>[] = []
        const [contextPagetree, targetSite] = await Promise.all([
          l.context ? pagetreeSvc.findById(l.context.pagetreeId) : undefined,
          siteSvc.findById(l.siteId)
        ])
        if (contextPagetree) {
          // the link is targeting the same site as the context, so we need to look for the link in
          // the same pagetree as the context
          // if we don't find the link in our pagetree, we do NOT fall back to the primary page tree,
          // we WANT the user to see a broken link in their sandbox because it will break when they go live
          lookups.push(
            this.loaders.get(assetsByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            this.loaders.get(assetsByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/[^/]+/, `/${contextPagetree.name}`)),
            this.loaders.get(assetsByChecksumLoader, { pagetreeIds: [contextPagetree.id] }).load(l.checksum)
          )
        }
        if (contextPagetree?.siteId !== l.siteId) {
          // the link is cross-site, so we only look in the primary tree in the site the link was targeting
          // we do NOT fall back to finding the linkId in other sites that the link did not originally
          // point at
          // this means that links will break when assets are moved between sites, which is unfortunate but
          // ignoring the link's siteId leads to madness because we could have multiple sites that all have
          // assets with the same linkId, and now I have to try to pick: do I prefer launched sites? etc
          const resolvedTargetSite = targetSite ?? await siteSvc.findByName(l.path.split('/')[1])
          if (!resolvedTargetSite || resolvedTargetSite.deleted) return undefined
          const lookuppath = l.path.replace(/^\/[^/]+/, `/${resolvedTargetSite?.name}`)
          lookups.push(
            this.loaders.get(assetsByLinkIdLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.linkId),
            this.loaders.get(assetsByPathLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(lookuppath),
            this.loaders.get(assetsByChecksumLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.checksum)
          )
        }
        const assets = await Promise.all(lookups)
        return sortby(assets.flat().filter(isNotNull), a => a.siteId === contextPagetree?.siteId, true)[0]
      }))

      const found = pages.filter(isNotNull)
      if (!found.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, found.map(p => p.internalId))
    }
    // TODO: referenced

    return filter
  }
}

export class AssetService extends DosGatoService<Asset> {
  raw = this.svc(AssetServiceInternal)

  async postFilter (assets: Asset[], filter?: AssetFilter) {
    return filter?.viewForEdit ? assets.filter(a => this.mayViewForEdit(a)) : assets
  }

  async find (filter: AssetFilter) {
    const ret = await this.raw.find(filter)
    if (filter.links?.length || filter.paths?.length || filter.ids?.length) return ret.filter(p => this.mayViewIndividual(p))
    return await this.postFilter(this.removeUnauthorized(ret), filter)
  }

  async findByFolder (folder: AssetFolder) {
    return this.removeUnauthorized(await this.raw.findByFolder(folder))
  }

  async findByFolders (folders: AssetFolder[]) {
    return this.removeUnauthorized(await this.raw.findByFolders(folders))
  }

  async getAncestors (asset: Asset) {
    return this.svc(AssetFolderService).removeUnauthorized(await this.raw.getAncestors(asset))
  }

  async getPath (asset: Asset) {
    return await this.raw.getPath(asset)
  }

  async getResizes (asset: Asset) {
    return await this.loaders.get(resizesByAssetIdLoader).load(asset.internalId)
  }

  async getResize (resizeId: string) {
    return await this.loaders.get(resizeLoader).load(resizeId)
  }

  async getThumbnail (asset: Asset) {
    const resizes = sortby((await this.getResizes(asset)).filter(r => thumbnailMimes.has(r.mime)), 'size')
    return resizes.find(r => r.width > 300) ?? resizes[0]
  }

  async getLatestDownload (asset: Asset) {
    const resizes = await this.getResizes(asset)
    return await getLatestDownload(asset, resizes.map(r => r.binaryId))
  }

  async getData (asset: Asset) {
    return await this.raw.getData(asset) as { legacyId?: string, shasum: string, uploadedFilename: string }
  }

  async getCorrupted (asset: Asset) {
    try {
      const size = await fileHandler.fileSize(asset.checksum)
      return asset.size !== size
    } catch {
      return true
    }
  }

  async getDownloads (asset: Asset, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByAssetIdLoader, filter).load(asset.dataId)
  }

  async getResizeDownloads (resize: AssetResize, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByResizeIdLoader, filter).load(resize.id)
  }

  async move (folderId: string, assetIds?: string[], folderIds?: string[]) {
    const folderSvc = this.svc(AssetFolderService)
    const folderSvcInternal = this.svc(AssetFolderServiceInternal)
    const [assets, folders, targetFolder] = await Promise.all([
      this.raw.findByIds(assetIds ?? []),
      folderSvcInternal.findByIds(folderIds ?? []),
      folderSvcInternal.findById(folderId)
    ])
    if (!targetFolder) throw new Error('Target asset folder does not exist.')
    if (folders.some(f => f.parentInternalId == null)) throw new Error('Root asset folders cannot be moved.')
    if (!folderSvc.mayCreate(targetFolder)) throw new Error(`You are not permitted to move files into folder ${targetFolder.name}`)
    for (const a of assets) if (!this.mayMove(a)) throw new Error(`You are not permitted to move asset ${a.filename}.`)
    for (const f of folders) if (!folderSvc.mayMove(f)) throw new Error(`You are not permitted to move asset folder ${f.name}.`)
    await moveAssets(targetFolder, assets, folders)
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async rename (assetId: string, name: string, validateOnly?: boolean) {
    if (isBlank(name)) return ValidatedResponse.error('Name is required.', 'name')
    const asset = await this.raw.findById(assetId)
    if (!asset) throw new Error('Asset not found.')
    if (!this.mayMove(asset)) throw new Error(`You are not permitted to rename asset ${asset.filename}.`)
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    const [siblings, siblingFolders] = await Promise.all([
      this.raw.findByFolderInternalId(asset.folderInternalId),
      this.svc(AssetFolderServiceInternal).getChildFolders(folder!)
    ])
    const response = new AssetResponse({ asset, success: true })
    if (asset.name === name) {
      /* no message at all - avoid giving them a "success" message when the rename won't do anything */
    } else if (siblings.some(s => s.name === name) || siblingFolders.some(f => f.name === name)) response.addMessage('That name is already taken.', 'name')
    else response.addMessage(`Name: ${name} is available.`, 'name', MutationMessageType.success)
    if (response.hasErrors() || validateOnly || asset.name === name) return response
    await renameAsset(assetId, name, folder!.path)
    this.loaders.clear()
    const newAsset = await this.raw.findById(assetId)
    response.success = true
    response.asset = newAsset
    return response
  }

  async update (assetId: string, data: any, validateOnly?: boolean) {
    const asset = await this.raw.findById(assetId)
    if (!asset) throw new Error('Asset not found.')
    if (!this.mayUpdate(asset)) throw new Error(`You are not permitted to update asset ${asset.filename}.`)
    const response = new AssetResponse({ asset, success: true })
    const errors = await templateRegistry.serverConfig.assetMeta?.validation?.(data, { path: await this.getPath(asset) })
    for (const err of errors ?? []) response.addMessage(err.message, err.path, err.type as MutationMessageType)
    if (response.hasErrors() || validateOnly) return response
    await updateAssetMeta(this.svc(VersionedService), asset, data, this.login)
    this.loaders.clear()
    const newAsset = await this.raw.findById(assetId)
    response.asset = newAsset
    return response
  }

  async copy (folderId: string, assetIds?: string[], folderIds?: string[]) {
    const [assets, folders, targetFolder] = await Promise.all([
      this.raw.findByIds(assetIds ?? []),
      this.svc(AssetFolderServiceInternal).findByIds(folderIds ?? []),
      this.svc(AssetFolderServiceInternal).findById(folderId)
    ])
    if (!targetFolder) throw new Error('Target asset folder does not exist.')
    if (folders.some(f => f.parentInternalId == null)) throw new Error('Root asset folders cannot be copied.')
    if (!this.svc(AssetFolderService).mayCreate(targetFolder)) throw new Error(`You are not permitted to copy files into folder ${targetFolder.name}`)
    await copyAssets(targetFolder, assets, folders, this.login, this.svc(VersionedService))
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async delete (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be deleted does not exist')
    if (!this.haveAssetPerm(asset, 'delete')) throw new Error(`You are not permitted to delete asset ${String(asset.name)}.${asset.extension}.`)
    try {
      await deleteAsset(asset.internalId, this.ctx.authInfo.user!.internalId)
      this.loaders.clear()
      const deletedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: deletedAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not delete asset')
    }
  }

  async deleteAssets (dataIds: string[]) {
    const assets = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (assets.some(asset => !this.haveAssetPerm(asset, 'delete'))) {
      throw new Error('You are not permitted to delete one or more assets')
    }
    const currentUser = this.ctx.authInfo.user
    try {
      await deleteAssets(assets.map(a => a.internalId), currentUser!.internalId)
      this.loaders.clear()
      const deleted = await this.raw.findByIds(assets.map(a => a.id))
      return new AssetsResponse({ success: true, assets: deleted })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error ocurred while trying to delete assets.')
    }
  }

  async finalizeDeletion (dataIds: string[]) {
    const assets = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (assets.some(asset => !this.haveAssetPerm(asset, 'delete'))) {
      throw new Error('You are not permitted to delete one or more assets.')
    }
    const currentUser = this.ctx.authInfo.user
    await finalizeAssetDeletion(assets.map(a => a.internalId), currentUser!.internalId)
    this.loaders.clear()
    const deletedAssets = await this.raw.findByIds(assets.map(a => a.id))
    return new AssetsResponse({ assets: deletedAssets, success: true })
  }

  async undelete (dataIds: string[]) {
    const assets = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (assets.some(asset => !this.mayUndelete(asset))) {
      throw new Error('You are not permitted to restore one or more assets.')
    }
    await undeleteAssets(assets.map(a => a.internalId))
    this.loaders.clear()
    const restoredAssets = await this.raw.findByIds(assets.map(a => a.id))
    return new AssetsResponse({ assets: restoredAssets, success: true })
  }

  mayViewManagerUI () {
    return this.ctx.authInfo.assetRules.some(r => r.grants.viewForEdit)
  }

  /**
  * assets must be viewable by any editor in case another editor with greater permissions linked to an asset in a chooser -
  * we don't want the dialog to appear broken
  *
  * mayViewForEdit will control whether the selected asset is still available to be selected in the chooser, so if they
  * can't see the currently selected asset they will just get a list of folders and will have to cancel the chooser to keep it
  */
  mayView (asset: Asset) {
    if (asset.orphaned) {
      return this.ctx.authInfo.siteRules.some(r => r.grants.delete && SiteRuleService.applies(r, asset.siteId))
    }
    for (const r of this.ctx.authInfo.assetRules) {
      if (!r.grants.view) continue
      if (!AssetRuleService.appliesToPagetree(r, asset)) continue
      if (asset.deleteState === DeleteState.DELETED && !r.grants.undelete) continue
      if (asset.deleteState === DeleteState.MARKEDFORDELETE && !r.grants.delete) continue
      if (AssetRuleService.appliesToPath(r, asset.resolvedPathWithoutSitename)) return true
      if (AssetRuleService.appliesToParentOfPath(r, asset.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  mayViewIndividual (asset: Asset) {
    return (!asset.orphaned && asset.launchState !== LaunchState.DECOMMISSIONED && primaryOrSandbox[asset.pagetreeType] && asset.deleteState === DeleteState.NOTDELETED) || this.mayView(asset)
  }

  /**
   * All assets in the system are viewable by any editor, but we don't want every editor to have to browse the entire system when
   * managing/choosing assets. So this can be used to filter the selection for an editor's convenience.
   */
  mayViewForEdit (asset: Asset) {
    return this.haveAssetPerm(asset, 'viewForEdit')
  }

  mayUpdate (asset: Asset) {
    return this.haveAssetPerm(asset, 'update')
  }

  mayMove (asset: Asset) {
    return this.haveAssetPerm(asset, 'move')
  }

  mayDelete (asset: Asset) {
    return this.haveAssetPerm(asset, 'delete')
  }

  mayUndelete (asset: Asset) {
    if (asset.deleteState === DeleteState.NOTDELETED || asset.orphaned) return false
    return asset.deleteState === DeleteState.MARKEDFORDELETE ? this.haveAssetPerm(asset, 'delete') : this.haveAssetPerm(asset, 'undelete')
  }
}
