import { BaseService, Context, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { filterAsync, intersect, isBlank, isNotNull, sortby } from 'txstate-utils'
import {
  Asset, AssetFilter, getAssets, AssetFolder, AssetFolderService, appendPath, getResizes,
  SiteService, DosGatoService, getLatestDownload, AssetFolderServiceInternal, AssetResponse,
  deleteAsset, undeleteAsset, getResizesById, VersionedService, getDownloads, DownloadsFilter,
  getResizeDownloads, AssetResize, AssetFolderResponse, moveAssets, copyAssets, finalizeAssetDeletion,
  renameAsset, updateAssetMeta, SiteServiceInternal, PagetreeServiceInternal, DeleteStateAll,
  getAssetsByPath, PagetreeType
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
    return appendPath(await this.svc(AssetFolderServiceInternal).getPath(folder), encodeURIComponent(asset.name as string))
  }

  async getData (asset: Asset, version?: number) {
    return (await this.svc(VersionedService).get(asset.dataId, { version }))!.data
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
        const lookups: Promise<Asset[]>[] = []
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
            this.loaders.get(assetsByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            this.loaders.get(assetsByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/[^/]+/, `/${contextPagetree.name}`)),
            this.loaders.get(assetsByChecksumLoader, { pagetreeIds: [contextPagetree.id] }).load(l.checksum)
          )
        } else {
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
        const pages = await Promise.all(lookups)
        return pages.find(p => p.length > 0)?.[0]
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
    return filter?.viewForEdit ? await filterAsync(assets, async a => await this.mayViewForEdit(a)) : assets
  }

  async find (filter: AssetFilter) {
    return await this.postFilter(await this.removeUnauthorized(await this.raw.find(filter)), filter)
  }

  async findByFolder (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.findByFolder(folder))
  }

  async findByFolders (folders: AssetFolder[]) {
    return await this.removeUnauthorized(await this.raw.findByFolders(folders))
  }

  async getAncestors (asset: Asset) {
    return await this.svc(AssetFolderService).removeUnauthorized(await this.raw.getAncestors(asset))
  }

  async getSite (asset: Asset) {
    return await this.svc(SiteService).removeUnauthorized(await this.raw.getSite(asset))
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

  async getDownloads (asset: Asset, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByAssetIdLoader, filter).load(asset.dataId)
  }

  async getResizeDownloads (resize: AssetResize, filter?: DownloadsFilter) {
    return await this.loaders.get(downloadsByResizeIdLoader, filter).load(resize.id)
  }

  async move (folderId: string, assetIds?: string[], folderIds?: string[]) {
    const [assets, folders, targetFolder] = await Promise.all([
      this.raw.findByIds(assetIds ?? []),
      this.svc(AssetFolderServiceInternal).findByIds(folderIds ?? []),
      this.svc(AssetFolderServiceInternal).findById(folderId)
    ])
    if (!targetFolder) throw new Error('Target asset folder does not exist.')
    if (folders.some(f => f.parentInternalId == null)) throw new Error('Root asset folders cannot be moved.')
    const assetSvc = this.svc(AssetService)
    const folderSvc = this.svc(AssetFolderService)
    const [haveCreatePerm] = await Promise.all([
      folderSvc.mayCreate(targetFolder),
      ...assets.map(async a => {
        if (!await assetSvc.mayMove(a)) throw new Error(`You are not permitted to move asset ${a.filename}.`)
      }),
      ...folders.map(async f => {
        if (!await folderSvc.mayMove(f)) throw new Error(`You are not permitted to move asset folder ${f.name}.`)
      })
    ])
    if (!haveCreatePerm) throw new Error(`You are not permitted to move files into folder ${targetFolder.name}`)
    await moveAssets(targetFolder, assets, folders)
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async rename (assetId: string, name: string, validateOnly?: boolean) {
    if (isBlank(name)) return ValidatedResponse.error('Name is required.', 'name')
    const asset = await this.raw.findById(assetId)
    if (!asset) throw new Error('Asset not found.')
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    const [siblings, siblingFolders] = await Promise.all([
      this.raw.findByFolderInternalId(asset.folderInternalId),
      this.svc(AssetFolderServiceInternal).getChildFolders(folder!)
    ])
    const response = new AssetResponse({ asset })
    if (siblings.some(s => s.name === name) || siblingFolders.some(f => f.name === name)) response.addMessage('That name is already taken.', 'name')
    else response.addMessage('Name is available.', 'name', MutationMessageType.success)
    if (response.hasErrors() || validateOnly) return response
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
    const siblings = await this.raw.findByFolderInternalId(asset.folderInternalId)
    const response = new AssetResponse({ asset })
    if (response.hasErrors() || validateOnly) return response
    await updateAssetMeta(this.svc(VersionedService), asset, data, this.login)
    this.loaders.clear()
    const newAsset = await this.raw.findById(assetId)
    response.success = true
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
    if (!await this.svc(AssetFolderService).mayCreate(targetFolder)) throw new Error(`You are not permitted to copy files into folder ${targetFolder.name}`)
    await copyAssets(targetFolder, assets, folders, this.login, this.svc(VersionedService))
    this.loaders.clear()
    return new AssetFolderResponse({ assetFolder: targetFolder, success: true })
  }

  async delete (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be deleted does not exist')
    if (!(await this.haveAssetPerm(asset, 'delete'))) throw new Error(`Current user is not permitted to delete asset ${String(asset.name)}.${asset.extension}.`)
    const currentUser = await this.currentUser()
    try {
      await deleteAsset(asset.internalId, currentUser!.internalId)
      this.loaders.clear()
      const deletedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: deletedAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not delete asset')
    }
  }

  async finalizeDeletion (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be deleted does not exist')
    if (!(await this.haveAssetPerm(asset, 'delete'))) throw new Error(`Current user is not permitted to delete asset ${String(asset.name)}.${asset.extension}.`)
    const currentUser = await this.currentUser()
    await finalizeAssetDeletion(asset.internalId, currentUser!.internalId)
    this.loaders.clear()
    const deletedAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
    return new AssetResponse({ asset: deletedAsset, success: true })
  }

  async undelete (dataId: string) {
    const asset = await this.loaders.get(assetsByIdLoader).load(dataId)
    if (!asset) throw new Error('Asset to be restored does not exist')
    if (!(await this.haveAssetPerm(asset, 'undelete'))) throw new Error(`Current user is not permitted to restore asset ${String(asset.name)}.${asset.extension}.`)
    try {
      await undeleteAsset(asset.internalId)
      this.loaders.clear()
      const restoredAsset = await this.loaders.get(assetsByIdLoader).load(dataId)
      return new AssetResponse({ asset: restoredAsset, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not restore asset folder')
    }
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
