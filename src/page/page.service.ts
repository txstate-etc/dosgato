import type { LinkDefinition, ComponentData, PageData, PageExtras, AssetLink, AssetFolderLink } from '@dosgato/templating'
import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import type { DateTime } from 'luxon'
import db from 'mysql2-async/db'
import { equal, filterAsync, get, intersect, isBlank, isNotBlank, isNotNull, keyby, set, someAsync, sortby } from 'txstate-utils'
import {
  VersionedService, templateRegistry, DosGatoService, type Page, type PageFilter, PageResponse, PagesResponse,
  createPage, getPages, movePages, deletePages, renamePage, TemplateService, type TemplateFilter,
  getPageIndexes, undeletePages, validatePage, copyPages, TemplateType, migratePage,
  PagetreeServiceInternal, collectTemplates, TemplateServiceInternal, SiteServiceInternal,
  PagetreeType, DeleteState, publishPageDeletions, type CreatePageExtras, parsePath,
  normalizePath, validateRecurse, type Template, type PageRuleGrants, DeleteStateAll, PageRuleService, SiteRuleService,
  systemContext, collectComponents, makePathSafe, LaunchState, type DGRestrictOperations, fireEvent, setPageSearchCodes,
  AssetServiceInternal, getPageLinks, type AssetLinkInput, AssetFolderServiceInternal, type AssetFolderLinkInput,
  type SearchRule, removeUnreachableComponents
} from '../internal.js'
import { getTagPageIds } from '../tag/tag.database.js'

const pagesByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getPages({ internalIds, deleteStates: DeleteStateAll })
  },
  extractId: (item: Page) => item.internalId
})

const pagesByDataIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPages({ ids, deleteStates: DeleteStateAll })
  },
  idLoader: pagesByInternalIdLoader
})
pagesByInternalIdLoader.addIdLoader(pagesByDataIdLoader)

const pagesInPagetreeLoader = new OneToManyLoader({
  fetch: async (pagetreeIds: string[], filter?: PageFilter) => {
    return await getPages({ ...filter, pagetreeIds })
  },
  extractKey: (p: Page) => p.pagetreeId,
  keysFromFilter: (filter: PageFilter | undefined) => filter?.pagetreeIds ?? [],
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByTemplateKeyLoader = new OneToManyLoader({
  fetch: async (templateKeys: string[], filter?: PageFilter) => {
    return await getPages({ ...filter, templateKeys })
  },
  extractKey: (p: Page) => p.templateKey,
  keysFromFilter: (filter: PageFilter | undefined) => filter?.templateKeys ?? [],
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByInternalIdPathLoader = new OneToManyLoader({
  fetch: async (internalIdPaths: string[], filter?: PageFilter) => {
    return await getPages({ ...filter, internalIdPaths })
  },
  extractKey: (p: Page) => p.path,
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[], filter?: PageFilter) => {
    const pages = await getPages({ ...filter, internalIdPathsRecursive })
    return pages
  },
  matchKey: (path: string, p: Page) => p.path.startsWith(path),
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByLinkIdLoader = new OneToManyLoader({
  fetch: async (linkIds: string[], filters: PageFilter) => {
    return await getPages({ ...filters, linkIds })
  },
  extractKey: p => p.linkId,
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByPathLoader = new OneToManyLoader({
  fetch: async (paths: string[], filters: PageFilter) => {
    return await getPages({ ...filters, paths })
  },
  extractKey: p => p.resolvedPath,
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

export const pagesByTagIdLoader = new ManyJoinedLoader({
  fetch: async (tagIds: string[], filters: PageFilter) => {
    const rows = await getTagPageIds(tagIds)
    if (!rows.length) return []
    const pages = await getPages({ ...filters, internalIds: intersect({ skipEmpty: true }, rows.map(r => r.pageId), filters.internalIds) })
    const pagesByInternalId = keyby(pages, 'internalId')
    return rows.map(r => ({ key: r.tagId, value: pagesByInternalId[r.pageId] }))
  },
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

export class PageServiceInternal extends BaseService {
  async find (filter: PageFilter) {
    filter = await this.processFilters(filter)

    const pages = await getPages(filter)
    for (const page of pages) {
      this.loaders.get(pagesByInternalIdLoader).prime(page.internalId, page)
      this.loaders.get(pagesByDataIdLoader).prime(page.id, page)
    }
    return pages
  }

  async findById (id: string) {
    return await this.loaders.get(pagesByDataIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(pagesByDataIdLoader, ids)
  }

  async findByInternalId (id: number) {
    return await this.loaders.get(pagesByInternalIdLoader).load(id)
  }

  async findByPagetreeId (id: string, filter?: PageFilter) {
    return await this.loaders.get(pagesInPagetreeLoader, filter).load(id)
  }

  async findByTemplate (key: string, filter?: PageFilter) {
    return await this.loaders.get(pagesByTemplateKeyLoader, filter).load(key)
  }

  async findByTag (tagId: string, filter?: PageFilter) {
    return await this.loaders.get(pagesByTagIdLoader, filter).load(tagId)
  }

  async getPageChildren (page: Page, recursive?: boolean, filter?: PageFilter) {
    const loader = recursive ? pagesByInternalIdPathRecursiveLoader : pagesByInternalIdPathLoader
    return await this.loaders.get(loader, filter).load(`${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`)
  }

  async getPageAncestors (page: Page) {
    return await this.loaders.loadMany(pagesByInternalIdLoader, page.pathSplit)
  }

  async getRootPage (page: Page) {
    const rootId = page.pathSplit[0]
    if (!rootId) return page
    return await this.findByInternalId(rootId)
  }

  /**
   * @deprecated use page.resolvedPath instead
   */
  getPath (page: Page) {
    return page.resolvedPath
  }

  async getData (page: Page, version?: number, published?: boolean, toSchemaVersion = templateRegistry.currentSchemaVersion) {
    const [versioned, extras] = await Promise.all([
      this.svc(VersionedService).get(page.intDataId, { tag: published ? 'published' : undefined, version }),
      this.pageExtras(page)
    ])
    if (!versioned) throw new Error('Asked for page data version that does not exist.')
    return await migratePage(versioned.data, extras, toSchemaVersion)
  }

  async pageExtras (page: Page) {
    return {
      query: this.ctx.query.bind(this.ctx),
      siteId: String(page.siteInternalId),
      pagetreeId: page.pagetreeId,
      parentId: String(page.parentInternalId),
      pagePath: page.resolvedPath,
      pageId: page.id,
      linkId: page.linkId,
      name: page.name
    } as PageExtras
  }

  async processFilters (filter: PageFilter) {
    if (filter.legacyIds?.length) {
      const pages = await this.svc(VersionedService).find([{ indexName: 'legacyId', in: filter.legacyIds }], 'page', filter.published ? 'published' : 'latest')
      if (!pages.length) filter.noresults = true
      else filter.ids = intersect({ skipEmpty: true }, filter.ids, pages)
    }
    if (filter.assetReferenced) {
      const asset = await this.svc(AssetServiceInternal).findById(filter.assetReferenced)
      if (!asset) filter.noresults = true
      else {
        const assetPath = '/' + asset.siteName + asset.resolvedPathWithoutSitename
        const folders = filter.assetReferencedDirect !== true ? await this.svc(AssetServiceInternal).getAncestors(asset) : []
        const folderLinkIds = new Set(folders.map(f => f.linkId))
        const folderIds = new Set(folders.map(f => f.id))
        const folderPaths = new Set(folders.map(f => '/' + f.siteName + (f.resolvedPathWithoutSitename === '/' ? '' : f.resolvedPathWithoutSitename)))
        const versionedSvc = this.svc(VersionedService)
        const publishedPagesToCheck = new Set<string>()
        const latestPagesToCheck = new Set<string>()

        const indexes: SearchRule[] = []
        if (filter.assetReferencedDirect !== false) {
          indexes.push(
            { indexName: 'link_asset_id', equal: asset.linkId },
            { indexName: 'link_asset_path', equal: assetPath },
            { indexName: 'link_asset_checksum', equal: asset.checksum }
          )
        }
        if (filter.assetReferencedDirect !== true) {
          indexes.push(
            { indexName: 'link_assetfolder_id', in: Array.from(folderLinkIds) },
            { indexName: 'link_assetfolder_path', in: Array.from(folderPaths) }
          )
        }
        const publishedPageIdsPromise = Promise.all(indexes.map(async index => await versionedSvc.find([index], 'page', 'published')))
        if (!filter.published) {
          const latestPageIds = (await Promise.all(indexes.map(async index => await versionedSvc.find([index], 'page', 'latest')))).flat()
          for (const pageId of latestPageIds) latestPagesToCheck.add(pageId)
        }
        for (const pageId of (await publishedPageIdsPromise).flat()) publishedPagesToCheck.add(pageId)

        const pageIds = Array.from(new Set([...publishedPagesToCheck, ...latestPagesToCheck]))
        if (!pageIds.length) filter.noresults = true
        else {
          let filteredPageIds: string[]
          if (asset.pagetreeType !== PagetreeType.PRIMARY || asset.launchState === LaunchState.DECOMMISSIONED) {
            const binds: string[] = [asset.pagetreeId]
            filteredPageIds = (await db.getvals<number>(`SELECT pages.dataId FROM pages WHERE pages.pagetreeId=? AND pages.dataId IN (${db.in(binds, pageIds)})`, binds)).map(String)
          } else {
            const binds: string[] = [asset.siteId, asset.pagetreeId]
            const query = `SELECT pages.dataId FROM pages WHERE (pages.siteId != ? OR pages.pagetreeId=?) AND pages.dataId IN (${db.in(binds, pageIds)})`
            filteredPageIds = (await db.getvals<number>(query, binds)).map(String)
          }

          const pages = await this.findByIds(filteredPageIds)
          const verifiedPageIds = new Set<string>()
          await Promise.all(pages.map(async page => {
            const links: LinkDefinition[] = []
            const publishedDataPromise = publishedPagesToCheck.has(page.dataId) ? this.getData(page, undefined, true) : undefined
            const latestDataPromise = latestPagesToCheck.has(page.dataId) ? this.getData(page, undefined, false) : undefined
            if (publishedDataPromise) links.push(...getPageLinks(await publishedDataPromise))
            if (latestDataPromise) links.push(...getPageLinks(await latestDataPromise))
            const assetLinks = links.filter(l => l.type === 'asset' && (l.id === asset.linkId || l.path === assetPath || l.checksum === asset.checksum)) as AssetLink[]
            const assetFolderLinks = links.filter(l => l.type === 'assetfolder' && (folderLinkIds.has(l.id) || folderPaths.has(l.path))) as AssetFolderLink[]
            const referencedAssetsPromise = (async () => {
              if (assetLinks.length) {
                const referencedAssets = await this.svc(AssetServiceInternal).find({
                  links: assetLinks.map(l => ({
                    linkId: l.id,
                    path: l.path!,
                    siteId: l.siteId!,
                    checksum: l.checksum!,
                    context: {
                      pagetreeId: page.pagetreeId
                    }
                  } satisfies AssetLinkInput))
                })
                if (referencedAssets.some(a => a.dataId === asset.dataId)) verifiedPageIds.add(page.dataId)
              }
            })()
            if (assetFolderLinks.length) {
              const referencedAssetFolders = await this.svc(AssetFolderServiceInternal).find({
                links: assetFolderLinks.filter(l => l.siteId).map(l => ({
                  linkId: l.id,
                  path: l.path,
                  siteId: l.siteId!,
                  context: {
                    pagetreeId: page.pagetreeId
                  }
                } satisfies AssetFolderLinkInput))
              })
              if (referencedAssetFolders.some(f => folderIds.has(f.id))) verifiedPageIds.add(page.dataId)
            }
            await referencedAssetsPromise
          }))
          if (!verifiedPageIds.size) filter.noresults = true
          filter.ids = intersect({ skipEmpty: true }, filter.ids, Array.from(verifiedPageIds))
        }
      }
    }
    if (filter.links?.length) {
      const pagetreeSvc = this.svc(PagetreeServiceInternal)
      const siteSvc = this.svc(SiteServiceInternal)
      const pages = await Promise.all(filter.links.map(async l => {
        const linkPathSplit = l.path.split('/').filter(isNotBlank)
        const lookups: (Promise<(Page | undefined)[]> | undefined)[] = []
        const [contextPagetree, targetSite] = await Promise.all([
          l.context ? pagetreeSvc.findById(l.context.pagetreeId) : undefined,
          siteSvc.findById(l.siteId)
        ])
        if (contextPagetree) {
          // always look to see if the link might be targeting something in the context pagetree, in case
          // multiple pages were copied together to another site.
          // if we don't find the link in our pagetree, we do NOT fall back to the primary page tree,
          // we WANT the user to see a broken link in their sandbox because it will break when they go live
          lookups.push(
            this.loaders.get(pagesByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            contextPagetree.siteId === l.siteId || contextPagetree.name.startsWith(linkPathSplit[0]) ? this.loaders.get(pagesByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/([^/]+)/, `/${contextPagetree.name}`)) : undefined
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
          const resolvedTargetSite = targetSite ?? await siteSvc.findByName(linkPathSplit[0])
          if (!resolvedTargetSite || resolvedTargetSite.deleted) return undefined
          const lookuppath = l.path.replace(/^\/[^/]+/, `/${resolvedTargetSite?.name}`)
          lookups.push(
            this.loaders.get(pagesByLinkIdLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId], launchStates: [LaunchState.LAUNCHED, LaunchState.PRELAUNCH] }).load(l.linkId),
            this.loaders.get(pagesByPathLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId], launchStates: [LaunchState.LAUNCHED, LaunchState.PRELAUNCH] }).load(lookuppath)
          )
        }
        const pages = await Promise.all(lookups)
        return sortby(pages.flat().filter(isNotNull), p => p.siteId === l.siteId, true, 'published', true, p => p.linkId === l.linkId, true)[0]
      }))
      const found = pages.filter(isNotNull)
      if (!found.length) filter.noresults = true
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, found.map(p => p.internalId))
    }
    if (filter.launchedUrls?.length) {
      const siteSvc = this.svc(SiteServiceInternal)
      const paths = (await Promise.all(filter.launchedUrls.map(async launchUrl => {
        const site = await siteSvc.findByLaunchUrl(launchUrl)
        if (!site) return undefined
        const parsed = new URL(launchUrl)
        const path = parsePath(parsed.pathname).path.substring(site.url!.path.length)
        return makePathSafe(normalizePath('/' + [site.name, path].filter(isNotBlank).join('/')))
      }))).filter(isNotNull)
      if (!paths.length) filter.noresults = true
      filter.paths = intersect({ skipEmpty: true }, filter.paths, paths)
    }
    if (filter.templateKeys?.length) {
      const dataIds = await this.svc(VersionedService).find([{ in: filter.templateKeys, indexName: 'template' }], 'page', filter.published ? 'published' : 'latest')
      if (!dataIds.length) filter.noresults = true
      filter.ids = intersect({ skipEmpty: true }, filter.ids, dataIds)
    }
    if (filter.tagsAll?.length) {
      const dataIds = await this.svc(VersionedService).findAll(filter.tagsAll.map(t => ({ indexName: 'dg_tag', value: t })))
      if (!dataIds.length) filter.noresults = true
      filter.ids = intersect({ skipEmpty: true }, filter.ids, dataIds)
    }
    if (filter.tagsAny?.length) {
      const dataIds = await this.svc(VersionedService).find(filter.tagsAny.map(t => ({ indexName: 'dg_tag', equal: t })))
      if (!dataIds.length) filter.noresults = true
      filter.ids = intersect({ skipEmpty: true }, filter.ids, dataIds)
    }
    return filter
  }
}

export class PageService extends DosGatoService<Page> {
  raw = this.svc(PageServiceInternal)

  postFilter (pages: Page[], filter?: PageFilter) {
    return filter?.viewForEdit ? pages.filter(p => this.mayViewForEdit(p)) : pages
  }

  async find (filter: PageFilter) {
    // performance boost for limited editors, don't make removeUnauthorized do quite as much work
    const siteIds = this.ctx.authInfo.pageSiteIds
    if (filter?.viewForEdit && siteIds != null) {
      if (siteIds.length) filter.siteIds = intersect({ skipEmpty: true }, filter.siteIds, siteIds)
      else filter.noresults = true
    }
    const ret = await this.raw.find(filter)
    if (filter.links?.length || filter.paths?.length || filter.ids?.length) return ret.filter(p => this.mayViewIndividual(p))
    return this.postFilter(this.removeUnauthorized(ret), filter)
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByIds (ids: string[]) {
    return this.removeUnauthorized(await this.raw.findByIds(ids))
  }

  async findByInternalId (internalId: number) {
    return this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findByPagetreeId (id: string, filter?: PageFilter) {
    const ret = await this.raw.findByPagetreeId(id, filter)
    return this.postFilter(this.removeUnauthorized(ret), filter)
  }

  async findByTemplate (key: string, filter?: PageFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByTemplate(key, filter)), filter)
  }

  async findByTag (tagId: string, filter?: PageFilter) {
    return this.postFilter(this.removeUnauthorized(await this.raw.findByTag(tagId, filter)), filter)
  }

  async getPageChildren (page: Page, recursive?: boolean, filter?: PageFilter) {
    return this.postFilter(this.removeUnauthorized(
      await this.raw.getPageChildren(page, recursive, filter)
    ), filter)
  }

  async getPageAncestors (page: Page) {
    return this.removeUnauthorized(await this.raw.getPageAncestors(page))
  }

  async getApprovedTemplates (page: Page, filter?: TemplateFilter) {
    const templates = await this.svc(TemplateServiceInternal).find(filter)
    return await filterAsync(templates, async template => await this.svc(TemplateService).mayUseOnPage(template, page))
  }

  async getRootPage (page: Page) {
    return this.removeUnauthorized(await this.raw.getRootPage(page))
  }

  getPath (page: Page) {
    return this.raw.getPath(page)
  }

  async getTags (page: Page, published?: boolean) {
    return await this.svc(VersionedService).getCurrentIndexValues(page.intDataId, 'dg_tag', published)
  }

  async getData (page: Page, version?: number, published?: boolean, toSchemaVersion = templateRegistry.currentSchemaVersion) {
    if (!published && !this.mayViewLatest(page)) throw new Error('User is only permitted to see the published version of this page.')
    return await this.raw.getData(page, version, published, toSchemaVersion)
  }

  hasPathBasedPageRulesForSite (siteId: string) {
    ;(this.ctx as any).hasPathBasedPageRulesForSite ??= {}
    if (!(this.ctx as any).hasPathBasedPageRulesForSite[siteId]) {
      const rules = this.ctx.authInfo.pageRules
      ;(this.ctx as any).hasPathBasedPageRulesForSite[siteId] = rules.some(r => r.path !== '/' && (!r.siteId || r.siteId === siteId))
    }
    return (this.ctx as any).hasPathBasedPageRulesForSite[siteId]
  }

  // may view the page in a list
  mayView (page: Page) {
    if (this.mayViewForEdit(page)) return true
    if (page.orphaned) return false // mayViewForEdit would have returned true if they could see orphaned page
    return page.launchState !== LaunchState.DECOMMISSIONED && page.pagetreeType !== PagetreeType.ARCHIVE && page.deleteState === DeleteState.NOTDELETED
  }

  // may view the page if requested individually
  mayViewIndividual (page: Page) {
    return (page.pagetreeType === PagetreeType.PRIMARY && !page.orphaned && page.deleteState === DeleteState.NOTDELETED && page.launchState === LaunchState.LAUNCHED) || this.mayViewForEdit(page)
  }

  // may view the page in an editing context
  mayViewForEdit (page: Page) {
    if (page.orphaned) {
      return this.ctx.authInfo.siteRules.some(r => r.grants.delete && SiteRuleService.applies(r, page.siteId))
    }
    for (const pr of this.ctx.authInfo.pageRules) {
      if (!pr.grants.view) continue
      if (!PageRuleService.appliesToPagetree(pr, page)) continue
      if (page.deleteState === DeleteState.DELETED && !pr.grants.undelete) continue
      if (page.deleteState === DeleteState.MARKEDFORDELETE && !pr.grants.delete) continue
      if (PageRuleService.appliesToPath(pr, page.resolvedPathWithoutSitename)) return true
      if (PageRuleService.appliesToChildOfPath(pr, page.resolvedPathWithoutSitename)) return true
      if (PageRuleService.appliesToParentOfPath(pr, page.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  mayViewLatest (page: Page) {
    return this.havePagePerm(page, 'viewlatest')
  }

  mayViewManagerUI () {
    return this.ctx.authInfo.pageRules.some(r => r.grants.viewForEdit)
  }

  /** @deprecated use page.published */
  isPublished (page: Page) {
    return page.published
  }

  async isLive (page: Page) {
    if (page.pagetreeType !== PagetreeType.PRIMARY) return false
    const [published, site] = await Promise.all([
      this.isPublished(page),
      this.svc(SiteServiceInternal).findById(String(page.siteInternalId))
    ])
    return published && site?.url != null && site.url.enabled === LaunchState.LAUNCHED
  }

  isOrphanedOrDeleted (page: Page, acceptPendingDelete?: boolean) {
    if (page.deleteState !== DeleteState.NOTDELETED && (page.deleteState !== DeleteState.MARKEDFORDELETE || !acceptPendingDelete)) return true
    return page.orphaned
  }

  checkPerm (page: Page, perm: keyof PageRuleGrants, acceptPendingDelete: boolean) {
    if (this.isOrphanedOrDeleted(page, acceptPendingDelete)) return false
    return this.havePagePerm(page, perm)
  }

  opRestricted (page: Page, operation: DGRestrictOperations) {
    return templateRegistry.serverConfig.restrictPageOperation?.({
      id: page.id,
      name: page.name,
      path: page.path,
      templateKey: page.templateKey,
      pagetreeType: page.pagetreeType
    }, operation, this.ctx.authInfo.roles)
  }

  // authenticated user may create pages underneath given page
  mayCreate (page: Page) {
    return !this.opRestricted(page, 'into') && this.checkPerm(page, 'create', false)
  }

  mayUpdate (page: Page) {
    return this.checkPerm(page, 'update', false)
  }

  async mayPublish (page: Page, parentBeingPublished?: boolean) {
    if (!this.checkPerm(page, 'publish', false)) return false
    if (page.pagetreeType === PagetreeType.ARCHIVE) return false
    if (page.parentInternalId && !parentBeingPublished) {
      const parent = await this.raw.findByInternalId(page.parentInternalId)
      return (!!parent!.published)
    }
    return true
  }

   async mayUnpublish (page: Page, parentBeingUnpublished?: boolean) {
    // root page of a site/pagetree cannot be unpublished if the site is live
    if (!page.parentInternalId && (await this.isLive(page))) return false
    if (this.opRestricted(page, 'unpublish')) return false
    return this.checkPerm(page, 'unpublish', !!parentBeingUnpublished) && (page.published || !!parentBeingUnpublished)
  }

  mayMove (page: Page) {
    if (!page.parentInternalId) return false // root page of a site/pagetree cannot be moved
    if (this.opRestricted(page, 'move')) return false
    return this.checkPerm(page, 'move', false)
  }

  mayDelete (page: Page) {
    if (!page.parentInternalId) return false // root page of a site/pagetree cannot be deleted
    if (this.opRestricted(page, 'delete')) return false
    return this.checkPerm(page, 'delete', true)
  }

  mayUndelete (page: Page) {
    if (page.deleteState === DeleteState.NOTDELETED || page.orphaned) return false
    return page.deleteState === DeleteState.MARKEDFORDELETE ? this.havePagePerm(page, 'delete') : this.havePagePerm(page, 'undelete')
  }

  /**
   * MUTATIONS
   */
  async movePages (dataIds: string[], targetId: string, above?: boolean) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!this.mayCreate(parent) || pages.some(page => !this.mayMove(page))) {
      throw new Error('You are not permitted to perform this move.')
    }

    if (pages.some(p => p.pagetreeId !== parent.pagetreeId)) throw new Error('Moving pages between sites or pagetrees is not allowed.')

    // movement between sites or pagetrees and already not allowed (see above)
    // and we would not want to disable movement just because an authorized person used a template
    // the current person can't use
    // therefore, skipping template validity check

    const newPageIds = await movePages(pages, parent, aboveTarget)
    return new PagesResponse({ success: true, pages: await getPages({ internalIds: newPageIds }) })
  }

  async copyPages (dataIds: string[], targetId: string, above?: boolean, includeChildren?: boolean) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (!pages.length) throw new Error('No valid pages selected.')
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!parent || !(this.mayCreate(parent))) {
      throw new Error('You are not permitted to copy pages to this location.')
    }
    // Is this page allowed to be copied here?
    const pageData = await Promise.all(pages.map(async page => await this.raw.getData(page)))
    const templateKeys = pageData.map(d => d.templateKey)
    const templates = await Promise.all(templateKeys.map(async k => await this.svc(TemplateServiceInternal).findByKey(k)))
    const templateByKey = keyby(templates.filter(isNotNull), 'key')
    const tmplSvc = this.svc(TemplateService)
    await Promise.all(templateKeys.map(async templateKey => {
      if (!templateByKey[templateKey]) throw new Error(`Template with key ${templateKey} is not valid and may not be copied.`)
      if (!await tmplSvc.mayUseOnPage(templateByKey[templateKey], parent)) throw new Error(`Template "${templateByKey[templateKey].name}" may not be copied to that location.`)
    }))

    const newPage = await copyPages(this.svc(VersionedService), this.login, pages, parent, aboveTarget, includeChildren)
    return new PageResponse({ success: true, page: newPage })
  }

  async validatePageTemplates (data: PageData, placement: { page?: Page, parent?: Page }) {
    const templateKeys = Array.from(collectTemplates(data))
    const templates = await Promise.all(templateKeys.map(async k => await this.svc(TemplateServiceInternal).findByKey(k)))
    const templateByKey = keyby(templates.filter(isNotNull), 'key')
    const oldData = placement.page ? await this.raw.getData(placement.page) : undefined
    if (oldData?.templateKey !== data.templateKey) {
      if (!templateByKey[data.templateKey]) throw new Error(`Tried to set page template to a non-existing template ${data.templateKey}.`)
      if (templateByKey[data.templateKey].type !== TemplateType.PAGE) throw new Error(`Tried to set page template to a non-page template ${data.templateKey}.`)
    }

    for (const templateKey of templateKeys) if (!templateByKey[templateKey]) throw new Error(`Template key ${templateKey} has not been registered.`)
    await Promise.all(placement.page
      ? templateKeys.map(async templateKey => {
        if (!await this.svc(TemplateService).mayKeepOnPage(templateKey, placement.page!, templateByKey[templateKey])) throw new Error(`Template ${templateKey} is not approved for use in this site or pagetree.`)
      })
      : templateKeys.map(async templateKey => {
        if (!await this.svc(TemplateService).mayUseOnPage(templateByKey[templateKey], placement.parent!, data.templateKey)) throw new Error(`Template ${templateKey} is not approved for use in this site or pagetree.`)
      })
    )
  }

  checkAvailableTemplates (data: ComponentData, templateByKey: Record<string, Template>) {
    for (const area of Object.keys(data.areas ?? {})) {
      const availableComponents = templateByKey[data.templateKey]._areasByName[area]?._availableComponentSet ?? new Set()
      const areaList = data.areas?.[area] ?? []
      if (!Array.isArray(areaList)) throw new Error('Encountered a non-array in area. That is not valid data.')
      for (let i = 0; i < areaList.length; i++) {
        const component = areaList[i]
        if (!component) throw new Error('Encountered an undefined component.')
        if (!availableComponents.has(component.templateKey)) throw new Error('At least one component is in an incompatible area.')
        this.checkAvailableTemplates(component, templateByKey)
      }
    }
  }

  async validatePageData (data: PageData, extras: PageExtras) {
    const response = new PageResponse({ success: true })
    const messages = await validatePage(data, extras)
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    return response
  }

  async createPage (name: string, data: PageData, targetId: string, above?: boolean, validateOnly?: boolean, extra?: CreatePageExtras) {
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(this.mayCreate(parent))) throw new Error('Current user is not permitted to create pages in the specified parent.')
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(parent.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const extras = {
      query: systemContext().query,
      siteId: site.id,
      pagetreeId: pagetree.id,
      parentId: parent.id,
      pagePath: `${parent.resolvedPath}/${name}`,
      name
    }
    const migrated = removeUnreachableComponents(await migratePage(data, extras))
    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    await this.validatePageTemplates(migrated, { parent })
    const response = await this.validatePageData(migrated, extras)
    const siblings = await this.raw.getPageChildren(parent, false)
    if (isBlank(name)) response.addMessage('Page name is required.', 'name')
    else if (siblings.some(p => p.name === name)) {
      response.addMessage(`Page name: ${name} already exists in this location.`, 'name')
    } else response.addMessage(`Page name: ${name} is available.`, 'name', MutationMessageType.success)
    if (!validateOnly && response.success) {
      const pageInternalId = await createPage(this.svc(VersionedService), this.login, parent, aboveTarget, name, migrated, extra)
      this.loaders.clear()
      response.page = (await this.raw.findByInternalId(pageInternalId))
    }
    return response
  }

  async updatePage (dataId: string, dataVersion: number, data: PageData, comment?: string, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    const parent = page.parentInternalId ? await this.findByInternalId(page.parentInternalId) : undefined
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const extras: PageExtras = {
      query: systemContext().query,
      siteId: site.id,
      pagetreeId: pagetree.id,
      parentId: parent?.id,
      pagePath: `${parent?.resolvedPath ?? ''}/${page.name}`,
      name: page.name,
      linkId: page.linkId,
      pageId: page.id
    }
    const migrated = await migratePage(data, extras)
    await this.validatePageTemplates(data, { page })
    const response = await this.validatePageData(migrated, extras)
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(migrated)
      await db.transaction(async db => {
        await this.svc(VersionedService).update(page!.intDataId, migrated, indexes, { user: this.login, comment, version: dataVersion })
        await db.update('UPDATE pages SET title=?, templateKey=? WHERE id=?', [migrated.title, migrated.templateKey, page!.internalId])
      })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  // make sure the page template is still valid but ignore validation and component template problems
  async restorePage (dataId: string, restoreVersion: number, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot restore an older version of a page that does not exist.')
    if (!(this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    const [dataToRestore, meta] = await Promise.all([
      this.svc(VersionedService).get(page.intDataId, { version: restoreVersion }),
      this.svc(VersionedService).getMeta(page.intDataId)
    ])
    if (!dataToRestore) throw new Error('Version to be restored could not be found.')
    const data = dataToRestore.data as PageData
    const tmpl = await this.svc(TemplateServiceInternal).findByKey(data.templateKey)
    const response = new PageResponse({ success: true })
    if (meta?.version === restoreVersion) response.addMessage('This is already the latest version.')
    if (!tmpl || !await this.svc(TemplateService).mayKeepOnPage(tmpl.key, page, tmpl)) response.addMessage('This version may not be restored because it uses a page template that is no longer available.')
    if (!validateOnly && response.success) {
      await db.transaction(async db => {
        await this.svc(VersionedService).restore(page!.intDataId, { version: restoreVersion }, { user: this.login, tdb: db })
        await db.update('UPDATE pages SET title=?, templateKey=? WHERE id=?', [data.title, data.templateKey, page!.internalId])
      })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async checkLatestVersion (dataId: string, dataVersion: number) {
    const latestVersion = await this.svc(VersionedService).get(Number(dataId))
    if (!latestVersion) throw new Error('Page you are trying to update is corrupted. Please contact user support.')
    if (latestVersion.version !== dataVersion) throw new Error('Unable to update page. Another user has updated the page since you loaded it. Try again after refreshing.')
  }

  async updatePageProperties (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, data: ComponentData, comment?: string, validateOnly?: boolean) {
    if (!data.templateKey) throw new Error('Component must have a templateKey.')
    delete data.areas
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)
    const extras = await this.raw.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)
    if (migrated.templateKey !== data.templateKey) throw new Error('You may not change page templates while updating properties. Use changePageTemplate instead.')

    const response = new PageResponse({ success: true })
    const updated: PageData = { ...data, templateKey: migrated.templateKey, savedAtVersion: migrated.savedAtVersion, areas: migrated.areas }
    const fullymigrated = await migratePage(updated, extras)
    if (fullymigrated.templateKey !== data.templateKey) throw new Error('There was a problem interpreting this save. You may need to refresh the page and try again.')

    const validator = templateRegistry.getPageTemplate(fullymigrated.templateKey)?.validate
    const messages = (await validator?.(fullymigrated, { ...extras, page: fullymigrated })) ?? []
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await db.transaction(async db => {
        await this.svc(VersionedService).update(page!.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion }, db)
        await db.update('UPDATE pages SET title=? WHERE id=?', [fullymigrated.title, page!.internalId])
        await setPageSearchCodes({ internalId: page!.internalId, name: page!.name, title: fullymigrated.title }, db)
      })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async updateComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, path: string, data: ComponentData, comment?: string, validateOnly?: boolean) {
    if (!data.templateKey) throw new Error('Component must have a templateKey.')
    delete data.areas
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)
    const extras = await this.raw.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)

    const response = new PageResponse({ success: true })
    const existing = get(migrated, path)
    if (!existing) throw new Error('Cannot update a component that does not exist.')
    if (existing.templateKey !== data.templateKey) throw new Error('Cannot update a component to have a new template key.')
    const updated = set(migrated, path, { ...data, areas: existing.areas })
    const fullymigrated = await migratePage(updated, extras)
    const migratedComponent = get<ComponentData>(fullymigrated, path)
    if (!migratedComponent || migratedComponent.templateKey !== data.templateKey) throw new Error('There was a problem interpreting this save. You may need to refresh the page and try again.')
    const validator = templateRegistry.getComponentTemplate(migratedComponent.templateKey)?.validate
    const messages = (await validator?.(migratedComponent, { ...extras, page: fullymigrated, path, currentData: migratedComponent })) ?? []
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(page.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async addComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, path: string, data: ComponentData, isCopy?: boolean, comment?: string, validateOnly?: boolean, addToTop?: boolean) {
    if (!data.templateKey) throw new Error('Component must have a templateKey.')
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion the UI was using
    const extras = await this.raw.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)

    // perform the operation to add the component to the requested area or location
    const toParts = path.split('.')
    let toParentArray: ComponentData[]
    let toParentPath = path
    let toIdx = Number(toParts[toParts.length - 1])
    if (!isNaN(toIdx)) { // they gave us a desired ordering
      toParentPath = toParts.slice(0, -1).join('.')
      toParentArray = get<ComponentData[] | undefined>(migrated, toParentPath) ?? []
    } else { // they only gave us an area
      toParentArray = get<ComponentData[] | undefined>(migrated, toParentPath) ?? []
      if (!Array.isArray(toParentArray)) throw new Error('Invalid target path.')
      toIdx = addToTop ? 0 : toParentArray.length
    }
    const parentComponentPath = toParentPath.split('.').slice(0, -2).join('.')
    const toParentComponent = get<ComponentData | undefined>(migrated, parentComponentPath)
    if (!toParentComponent?.templateKey) throw new Error('Cannot add content at the given path.')
    const compPath = toParentPath + '.' + String(toIdx)
    const updated = set(migrated, toParentPath, toIdx === toParentArray.length ? [...toParentArray, data] : toParentArray.flatMap((c, i) => i === toIdx ? [data, c] : c))

    // migrate the edited page data up to the latest version of the API so that we can validate
    const fullymigrated = await migratePage(updated, extras)

    // check that the migration didn't move things around so much that we have to abort
    // this will happen when the UI and the API are so far apart that some particularly aggressive
    // migrations exist between them that move components around on the page
    // in that situation we cannot recover and we have to demand that the UI software is updated to
    // the latest version in order to proceed - typically this means having the editor refresh their
    // browser window
    const migratedComponent = get<ComponentData | undefined>(fullymigrated, compPath)
    const migratedToParentComponent = get<ComponentData | undefined>(fullymigrated, parentComponentPath)
    if (migratedComponent?.templateKey !== data.templateKey || migratedToParentComponent?.templateKey !== toParentComponent.templateKey) throw new Error('There was a problem interpreting this action. You may need to refresh the page and try again.')

    // check that any new templates exist and are legal in their areas
    const templateKeys = Array.from(collectTemplates(migratedComponent))
    const templates = await Promise.all(templateKeys.map(async k => await this.svc(TemplateServiceInternal).findByKey(k)))
    const templateByKey = keyby(templates.filter(isNotNull), 'key')
    for (const templateKey of templateKeys) if (!templateByKey[templateKey]) throw new Error(`Template key ${templateKey} has not been registered.`)

    // check that the new component is compatible with its area
    const toParentTemplate = templateRegistry.getPageOrComponentTemplate(migratedToParentComponent.templateKey)
    const areaName = toParentPath.split('.').slice(-1)[0]
    if (!toParentTemplate?.areas?.[areaName]?.includes(migratedComponent.templateKey)) throw new Error('The content you are trying to add is not compatible with the area you are trying to add it into.')

    // check that any sub-components are compatible with their areas
    this.checkAvailableTemplates(migratedComponent, templateByKey)

    // check that any new templates are legal on the page
    await Promise.all(templateKeys.map(async templateKey => {
      if (!await this.svc(TemplateService).mayUseOnPage(templateByKey[templateKey], page!)) throw new Error(`Template ${templateKey} is not approved for use in this site or pagetree.`)
    }))

    // run the template's onCopy routine to regenerate unique ids
    if (isCopy) {
      const workspace = {}
      for (const c of collectComponents(migratedComponent)) templateRegistry.getComponentTemplate(c.templateKey).onCopy?.(c, false, workspace)
    }

    // run validations only on the new component and any areas beneath it
    const response = new PageResponse({ success: true })
    const messages = await validateRecurse({ ...extras, page: fullymigrated, path: compPath, currentData: undefined }, migratedComponent, compPath.split('.'))
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }

    // execute the mutation if appropriate
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(page.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async moveComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, fromPath: string, toPath: string, comment?: string) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion the UI was using
    const extras = await this.raw.pageExtras(page)
    let migrated = await migratePage(pageData, extras, editedSchemaVersion)

    // perform the operation to move the component from one place to another
    const fromObj = get<ComponentData>(migrated, fromPath)
    if (!fromObj?.templateKey) throw new Error('Cannot find valid content at the given path.')
    const fromParts = fromPath.split('.')
    const fromParentParts = fromParts.slice(0, -1)
    const fromParentPath = fromParentParts.join('.')
    const fromIdx = Number(fromParts[fromParts.length - 1])

    const toParts = toPath.split('.')
    let toParentPath = toPath
    let toIdx: number = Number(toParts[toParts.length - 1])
    if (!isNaN(toIdx)) { // they gave us a component path, we will insert content there
      toParentPath = toParts.slice(0, -1).join('.')
      toIdx = Number(toParts[toParts.length - 1])
      // if the desired index is exactly one below, reorder below that item
      if (fromParentPath === toParentPath && toIdx === fromIdx + 1) toIdx++
    } else { // they gave us an area path, we will append content to it
      const toParentArray = get<ComponentData[] | undefined>(migrated, toPath) ?? []
      if (!Array.isArray(toParentArray)) throw new Error('Invalid target path.')
      toIdx = toParentArray.length
    }
    const toParentParts = toParentPath.split('.')
    const toParentComponentParts = toParentParts.slice(0, -2)
    const toParentComponentPath = toParentComponentParts.join('.')
    const toParentComponent = isBlank(toParentComponentPath) ? migrated : get(migrated, toParentComponentPath)
    if (!toParentComponent) throw new Error('Cannot move component to the given path.')

    let finalIdx = toIdx
    function add () {
      const toComponents = get<ComponentData[] | undefined>(migrated, toParentPath) ?? []
      migrated = set(migrated, toParentPath, toIdx === toComponents.length ? [...toComponents, fromObj] : toComponents.flatMap((c, i) => i === toIdx ? [fromObj, c] : c))
    }
    function remove () {
      migrated = set(migrated, fromParentPath, get<ComponentData[]>(migrated, fromParentPath).filter((c, i) => i !== fromIdx))
    }
    if (fromParentParts.length > toParentParts.length || (fromParentParts.length === toParentParts.length && toIdx < fromIdx)) {
      // moving from deep to shallow or up in the same list -> delete then add
      remove()
      add()
    } else {
      // moving from shallow to deep or down in the same list -> add then delete
      add()
      remove()
      if (equal(fromParentParts, toParentParts)) finalIdx--
      else if (toParentPath.startsWith(fromParentPath) && fromIdx < Number(toParentParts[fromParentParts.length])) {
        toParentParts[fromParentParts.length] = String(Number(toParentParts[fromParentParts.length]) - 1)
        toParentComponentParts[fromParentParts.length] = String(Number(toParentComponentParts[fromParentParts.length]) - 1)
      }
    }

    const finalComponentPath = [...toParentParts, finalIdx].join('.')
    const finalToParentComponentPath = toParentComponentParts.join('.')

    // migrate the edited page data to the latest version of the API so we can check for available component compatibility
    const fullymigrated = await migratePage(migrated, extras)
    const migratedToParentComponent = get(fullymigrated, finalToParentComponentPath)
    const migratedComponent = get(fullymigrated, finalComponentPath)
    if (!migratedComponent || migratedComponent.templateKey !== fromObj.templateKey || !migratedToParentComponent || migratedToParentComponent.templateKey !== toParentComponent.templateKey) throw new Error('There was a problem interpreting this action. You may need to refresh the page and try again.')
    const toParentTemplate = templateRegistry.getPageOrComponentTemplate(migratedToParentComponent.templateKey)
    const areaName = toParentParts[toParentParts.length - 1]
    if (!toParentTemplate?.areas?.[areaName]?.includes(migratedComponent.templateKey)) throw new Error('The content you are trying to move is not compatible with the area you are trying to move it into.')

    // if we haven't thrown yet then we can execute the mutation
    const indexes = getPageIndexes(fullymigrated)
    await this.svc(VersionedService).update(page.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
    this.loaders.clear()
    page = await this.raw.findById(dataId)
    const response = new PageResponse({ success: true })
    response.page = page
    return response
  }

  async deleteComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, path: string, comment?: string) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!this.mayUpdate(page)) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion of the admin UI
    const extras = await this.raw.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)

    // execute the deletion
    const dataToDelete = get<ComponentData>(migrated, path)
    if (!dataToDelete) throw new Error('Cannot find any content at the given path.')
    const fromParentPath = path.split('.').slice(0, -1).join('.')
    const fromArray = get<ComponentData[] | undefined>(migrated, fromParentPath)
    const fromIndex = Number(path.split('.').slice(-1)[0])
    if (!fromArray || isNaN(fromIndex)) throw new Error('Cannot delete content from the given path.')
    fromArray.splice(fromIndex, 1)

    // migrate the edited data to the latest version of the API so we can index it properly
    const fullymigrated = await migratePage(migrated, extras)

    // if we haven't thrown yet then we can execute the mutation
    const indexes = getPageIndexes(fullymigrated)
    await this.svc(VersionedService).update(page.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
    this.loaders.clear()
    page = await this.raw.findById(dataId)
    const response = new PageResponse({ success: true })
    response.page = page
    return response
  }

  async changePageTemplate (dataId: string, templateKey: string, dataVersion?: number, comment?: string, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (this.opRestricted(page, 'changetemplate') || !this.mayUpdate(page)) throw new Error("You are not permitted to change this page's template.")
    const pageData = await this.raw.getData(page, dataVersion)

    const extras = await this.raw.pageExtras(page)
    const fullymigrated = await migratePage(pageData, extras)

    const template = await this.svc(TemplateServiceInternal).findByKey(templateKey)
    if (!template) throw new Error(`Tried to set page template to a non-existing template ${templateKey}.`)
    if (template.type !== TemplateType.PAGE) throw new Error(`Tried to set page template to a non-page template ${templateKey}.`)
    const response = new PageResponse({ success: true })
    if (!await this.svc(TemplateService).mayUseOnPage(template, page)) response.addMessage('You are not permitted to use that template here.')

    if (!validateOnly && response.success) {
      fullymigrated.templateKey = templateKey
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(page.intDataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      await db.update('UPDATE pages SET templateKey=? WHERE id=?', [fullymigrated.templateKey, page.internalId])
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async renamePage (dataId: string, name: string, validateOnly?: boolean) {
    const page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot rename a page that does not exist.')
    if (this.opRestricted(page, 'rename') || !this.mayMove(page)) throw new Error('You are not permitted to rename this page.')
    const response = new PageResponse({ success: true })
    if (isNotNull(page.parentInternalId)) {
      const parent = await this.raw.findByInternalId(page.parentInternalId)
      const siblings = await this.raw.getPageChildren(parent!, false)
      if (isBlank(name)) response.addMessage('Page name is required.', 'name')
      else if (siblings.some(p => p.name === name) && name !== page.name) {
        response.addMessage(`Page name: ${name} already exists in this location.`, 'name')
      } else if (name !== page.name) response.addMessage(`Page name: ${name} is available.`, 'name', MutationMessageType.success)
    } else {
      throw new Error('Cannot rename the root page')
    }
    if (validateOnly || response.hasErrors()) return response
    await renamePage(page, name)
    this.loaders.clear()
    response.page = await this.raw.findById(dataId)
    return response
  }

  async deletePages (dataIds: string[]) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (pages.some(page => !this.mayDelete(page))) {
      throw new Error('Current user is not permitted to delete one or more pages')
    }
    try {
      await deletePages(this.svc(VersionedService), pages, this.ctx.authInfo.user!.internalId)
      this.loaders.clear()
      const updated = await this.raw.findByIds(dataIds)
      return new PagesResponse({ success: true, pages: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error ocurred while trying to delete a page.')
    }
  }

  async publishPageDeletions (dataIds: string[]) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull).filter(p => p.deleteState !== DeleteState.NOTDELETED)
    if (pages.some(page => !this.mayDelete(page))) {
      throw new Error('You are not permitted to delete one or more of the selected pages.')
    }
    await publishPageDeletions(pages, this.ctx.authInfo.user!.internalId)
    this.loaders.clear()
    const updated = await this.raw.findByIds(pages.map(p => p.id))
    return new PagesResponse({ success: true, pages: updated })
  }

  async undeletePages (dataIds: string[], includeChildren?: boolean) {
    let pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (includeChildren) {
      const children = (await Promise.all(pages.map(async page => await this.getPageChildren(page, true)))).flat()
      pages = [...pages, ...children]
    }
    if (pages.some(page => !this.mayUndelete(page))) {
      throw new Error('You are not permitted to restore one or more of the selected pages.')
    }
    await undeletePages(pages)
    this.loaders.clear()
    const restored = await this.raw.findByIds(dataIds)
    return new PagesResponse({ success: true, pages: restored })
  }

  async publishPages (dataIds: string[], includeChildren?: boolean) {
    let pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (includeChildren) {
      const children = (await Promise.all(pages.map(async (page) => await this.getPageChildren(page, true)))).flat().filter(c => c.deleteState === DeleteState.NOTDELETED)
      pages = [...pages, ...children]
    }
    if (await someAsync(pages, async (page: Page) => !(await this.mayPublish(page, true)))) {
      throw new Error('Current user is not permitted to publish one or more pages')
    }
    pages = pages.filter(p => !p.deleted)
    try {
      await db.transaction(async db => {
        for (const p of pages) await this.svc(VersionedService).tag(p.intDataId, 'published', undefined, this.login)
      })
      this.loaders.clear()
      await Promise.all(pages.map(async page => { await fireEvent({ type: 'publish', page }) }))
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to publish one or more pages.')
    }
  }

  async unpublishPages (dataIds: string[]) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const children = (await Promise.all(pages.flatMap(async (page) => await this.getPageChildren(page, true)))).flat()
    const childrenById = keyby(children, 'id')
    const actualParents = pages.filter(p => !childrenById[p.id])
    const mayUnpublishPromises: Promise<boolean>[] = []
    mayUnpublishPromises.push(...actualParents.map(async page => !!await this.mayUnpublish(page, false)))
    mayUnpublishPromises.push(...children.map(async page => !!await this.mayUnpublish(page, true)))
    if (await someAsync(mayUnpublishPromises, async promise => !await promise)) {
      throw new Error('Current user is not permitted to unpublish one or more pages.')
    }
    await db.transaction(async db => {
      await this.svc(VersionedService).removeTags([...actualParents, ...children].map(p => p.intDataId), ['published'], db)
    })
    this.loaders.clear()
    await Promise.all(pages.map(async page => { await fireEvent({ type: 'unpublish', page }) }))
    return new ValidatedResponse({ success: true })
  }

  /**
   * Mutation Helpers
   */
  protected async resolveTarget (targetId: string, above?: boolean) {
    const target = await this.raw.findById(targetId)
    let parent = target
    let aboveTarget
    if (above) {
      parent = target?.parentInternalId ? await this.raw.findByInternalId(target.parentInternalId) : undefined
      aboveTarget = target
    }
    if (!parent) throw new Error('Target selection not appropriate.')
    return { parent, aboveTarget }
  }
}
