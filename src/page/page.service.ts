import { ComponentData, PageData, PageExtras, PageLink } from '@dosgato/templating'
import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { DateTime } from 'luxon'
import db from 'mysql2-async/db'
import { filterAsync, get, intersect, isBlank, isNotBlank, isNotNull, keyby, set, someAsync, stringify, unique } from 'txstate-utils'
import {
  VersionedService, templateRegistry, DosGatoService, Page, PageFilter, PageResponse, PagesResponse,
  createPage, getPages, movePages, deletePages, renamePage, TemplateService, TemplateFilter,
  getPageIndexes, undeletePages, validatePage, DeletedFilter, copyPages, TemplateType, migratePage,
  Pagetree, PagetreeServiceInternal, collectTemplates, TemplateServiceInternal, SiteServiceInternal,
  Site, PagetreeType, DeleteState, publishPageDeletions, CreatePageExtras, getPagesByPath, parsePath,
  normalizePath, validateRecurse, Template
} from '../internal.js'

const pagesByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getPages({ internalIds, deleted: DeletedFilter.SHOW })
  },
  extractId: (item: Page) => item.internalId
})

const pagesByDataIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPages({ ids, deleted: DeletedFilter.SHOW })
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
  extractKey: p => p.linkId
})

const pagesByPathLoader = new ManyJoinedLoader({
  fetch: async (paths: string[], filters: PageFilter) => {
    return await getPagesByPath(paths, filters)
  }
})

export class PageServiceInternal extends BaseService {
  async find (filter: PageFilter) {
    filter = await this.processFilters(filter)

    // TODO: move this to processFilters?
    if (filter.linkIdsReferenced?.length) {
      const searchRule = { indexName: 'link_page', in: filter.linkIdsReferenced.map(linkId => (stringify({ linkId }))) }
      const [dataIdsLatest, dataIdsPublished] = await Promise.all([
        this.svc(VersionedService).find([searchRule], 'page'),
        this.svc(VersionedService).find([searchRule], 'page', 'published')])
      const dataIds = unique([...dataIdsLatest, ...dataIdsPublished])
      if (filter.ids?.length) filter.ids.push(...dataIds)
      else filter.ids = dataIds
      // TODO: look at this in VersionedService. Does tag need to be required in the find method? Can we find multiple tags at once?
    }
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
    const searchRule = { indexName: 'templateKey', equal: key }
    const [dataIdsLatest, dataIdsPublished] = await Promise.all([
      this.svc(VersionedService).find([searchRule], 'page'),
      this.svc(VersionedService).find([searchRule], 'page', 'published')])
    let dataIds = unique([...dataIdsLatest, ...dataIdsPublished])
    if (!dataIds.length) return []
    if (filter?.ids?.length) {
      dataIds = dataIds.filter(i => filter.ids?.includes(i))
    }
    return await this.findByIds(dataIds)
  }

  async getPageChildren (page: Page, recursive?: boolean, filter?: PageFilter) {
    const loader = recursive ? pagesByInternalIdPathRecursiveLoader : pagesByInternalIdPathLoader
    return await this.loaders.get(loader).load(`${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`)
  }

  async getPageAncestors (page: Page) {
    return await this.loaders.loadMany(pagesByInternalIdLoader, page.pathSplit)
  }

  async getRootPage (page: Page) {
    const rootId = page.pathSplit[0]
    if (!rootId) return page
    return await this.findByInternalId(rootId)
  }

  async getPath (page: Page) {
    const ancestors = await this.getPageAncestors(page)
    return `/${ancestors.map(a => a.name).join('/')}${ancestors.length ? '/' : ''}${page.name}`
  }

  async getData (page: Page, version?: number, published?: boolean, toSchemaVersion = templateRegistry.currentSchemaVersion) {
    const [versioned, pagetree, parent, path] = await Promise.all([
      this.svc(VersionedService).get(page.dataId, { tag: published ? 'published' : undefined, version }),
      this.svc(PagetreeServiceInternal).findById(page.pagetreeId),
      page.parentInternalId ? this.findByInternalId(page.parentInternalId) : undefined,
      this.getPath(page)
    ])
    if (!versioned) throw new Error('Asked for page data version that does not exist.')
    return await migratePage(versioned.data, {
      query: this.ctx.query,
      siteId: pagetree!.siteId,
      pagetreeId: pagetree!.id,
      parentId: parent?.id,
      pagePath: path,
      pageId: page.id,
      linkId: page.linkId,
      name: page.name
    }, toSchemaVersion)
  }

  async processFilters (filter: PageFilter) {
    if (filter.legacyIds?.length) {
      const pages = await this.svc(VersionedService).find([{ indexName: 'legacyId', in: filter.legacyIds }], 'page', filter.published ? 'published' : 'latest')
      if (!pages.length) filter.ids = ['-1']
      else filter.ids = intersect({ skipEmpty: true }, filter.ids, pages)
    }
    if (filter.referencedByPageIds?.length) {
      // TODO: refactor this to use VersionedService indexes instead of rescanning the data
      const verService = this.svc(VersionedService)
      const pages = (await Promise.all(filter.referencedByPageIds.map(async id => await this.findById(id)))).filter(isNotNull)
      const pagedata = (await Promise.all(pages.map(async page => await verService.get<PageData>(page.dataId, { tag: filter.published ? 'published' : undefined })))).filter(isNotNull)
      const links = pagedata.flatMap(d => templateRegistry.get(d.data.templateKey)?.getLinks(d.data)).filter(l => l.type === 'page') as PageLink[]
      filter.links = intersect({ skipEmpty: true, by: lnk => stringify({ ...lnk, type: 'page' }) }, links, filter.links?.map(l => ({ ...l, type: 'page' })) as PageLink[])
    }
    if (filter.links?.length) {
      const pagetreeSvc = this.svc(PagetreeServiceInternal)
      const pages = await Promise.all(filter.links.map(async l => {
        const lookups: Promise<Page[]>[] = []
        const contextPagetree = l.context && await pagetreeSvc.findById(l.context.pagetreeId)
        if (contextPagetree?.siteId === l.siteId) {
          // the link is targeting the same site as the context, so we need to look for the link in
          // the same pagetree as the context
          // if we don't find the link in our pagetree, we do NOT fall back to the primary page tree,
          // we WANT the user to see a broken link in their sandbox because it will break when they go live
          lookups.push(
            this.loaders.get(pagesByLinkIdLoader, { pagetreeIds: [contextPagetree.id] }).load(l.linkId),
            this.loaders.get(pagesByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path.replace(/^\/[^/]+/, `/${contextPagetree.name}`))
          )
        } else {
          // the link is cross-site, so we only look in the primary tree in the site the link was targeting
          // we do NOT fall back to finding the linkId in other sites that the link did not originally
          // point at
          // this means that links will break when pages are moved between sites, which is unfortunate but
          // ignoring the link's siteId leads to madness because we could have multiple sites that all have
          // pages with the same linkId, and now I have to try to pick: do I prefer launched sites? published
          // pages? etc
          lookups.push(
            this.loaders.get(pagesByLinkIdLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.linkId),
            this.loaders.get(pagesByPathLoader, { pagetreeTypes: [PagetreeType.PRIMARY], siteIds: [l.siteId] }).load(l.path)
          )
        }
        const pages = await Promise.all(lookups)
        return pages.find(p => p.length > 0)?.[0]
      }))
      const found = pages.filter(isNotNull)
      if (!found.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, found.map(p => p.internalId))
    }
    if (filter.launchedUrls?.length) {
      const siteSvc = this.svc(SiteServiceInternal)
      const paths = (await Promise.all(filter.launchedUrls.map(async launchUrl => {
        const site = await siteSvc.findByLaunchUrl(launchUrl)
        if (!site) return undefined
        const parsed = new URL(launchUrl)
        const path = parsePath(parsed.pathname).path.substring(site.url!.path.length)
        return normalizePath('/' + [site.name, path].filter(isNotBlank).join('/'))
      }))).filter(isNotNull)
      if (!paths.length) filter.internalIds = [-1]
      filter.paths = intersect({ skipEmpty: true }, filter.paths, paths)
    }
    return filter
  }
}

export class PageService extends DosGatoService<Page> {
  raw = this.svc(PageServiceInternal)

  async find (filter: PageFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByIds (ids: string[]) {
    return await this.removeUnauthorized(await this.raw.findByIds(ids))
  }

  async findByInternalId (internalId: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findByPagetreeId (id: string, filter?: PageFilter) {
    return await this.removeUnauthorized(await this.raw.findByPagetreeId(id, filter))
  }

  async findByTemplate (key: string, filter?: PageFilter) {
    return await this.removeUnauthorized(await this.raw.findByTemplate(key, filter))
  }

  async getPageChildren (page: Page, recursive?: boolean, filter?: PageFilter) {
    return await this.removeUnauthorized(
      await this.raw.getPageChildren(page, recursive, filter)
    )
  }

  async getPageAncestors (page: Page) {
    return await this.removeUnauthorized(await this.raw.getPageAncestors(page))
  }

  async getApprovedTemplates (page: Page, filter?: TemplateFilter) {
    const templates = await this.svc(TemplateService).find(filter)
    return await filterAsync(templates, async template => await this.svc(TemplateService).mayUseOnPage(template, page))
  }

  async getRootPage (page: Page) {
    return await this.removeUnauthorized(await this.raw.getRootPage(page))
  }

  async getPath (page: Page) {
    return await this.raw.getPath(page)
  }

  async getData (page: Page, version?: number, published?: boolean, toSchemaVersion = templateRegistry.currentSchemaVersion) {
    if (!published && !await this.mayViewLatest(page)) throw new Error('User is only permitted to see the published version of this page.')
    return await this.raw.getData(page, version, published, toSchemaVersion)
  }

  async mayView (page: Page) {
    if (await this.havePagePerm(page, 'view')) return true
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const children = await this.raw.getPageChildren(page, true)
    for (const c of children) {
      if (await this.havePagePerm(c, 'view')) return true
    }
    return false
  }

  async mayViewForEdit (page: Page) {
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const children = await this.raw.getPageChildren(page, true)
    for (const c of children) {
      if (await this.havePagePerm(c, 'viewForEdit')) return true
    }
    // if we have some sort of permission on a single page, we should be able to see its children
    // since it might be important
    const parent = page.parentInternalId ? await this.raw.findByInternalId(page.parentInternalId) : undefined
    if (parent && await this.havePagePerm(parent, 'viewForEdit')) return true
    return await this.havePagePerm(page, 'viewForEdit')
  }

  async mayViewLatest (page: Page) {
    return await this.havePagePerm(page, 'viewlatest')
  }

  async mayViewManagerUI () {
    return (await this.currentPageRules()).some(r => r.grants.viewForEdit)
  }

  async isInArchive (page: Page) {
    const pagetree = await this.svc(PagetreeServiceInternal).findById(page.pagetreeId)
    return pagetree!.type === PagetreeType.ARCHIVE
  }

  async isPublished (page: Page) {
    const tag = await this.svc(VersionedService).getTag(page.dataId, 'published')
    return !!tag
  }

  async isDeleted (page: Page) {
    if (page.deleteState !== DeleteState.NOTDELETED) return true
    const pagetree = await this.svc(PagetreeServiceInternal).findById(page.pagetreeId)
    if (pagetree!.deleted) return true
    const site = await this.svc(SiteServiceInternal).findByPagetreeId(pagetree!.id)
    if (site!.deleted) return true
    return false
  }

  // authenticated user may create pages underneath given page
  async mayCreate (page: Page) {
    if (await this.isInArchive(page)) return false
    if (await this.isDeleted(page)) return false
    return await this.havePagePerm(page, 'create')
  }

  async mayUpdate (page: Page) {
    if (await this.isInArchive(page)) return false
    if (await this.isDeleted(page)) return false
    return await this.havePagePerm(page, 'update')
  }

  async mayPublish (page: Page, parentBeingPublished?: boolean) {
    if (await this.isInArchive(page)) return false
    if (await this.isDeleted(page)) return false
    if (page.parentInternalId && !parentBeingPublished) {
      const parent = await this.raw.findByInternalId(page.parentInternalId)
      if (!await this.isPublished(parent!)) return false
    }
    return await this.havePagePerm(page, 'publish')
  }

  async mayUnpublish (page: Page) {
    if (!page.parentInternalId) return false // root page of a site/pagetree cannot be unpublished - the site launch should be disabled instead
    if (await this.isInArchive(page)) return false
    if (!await this.isPublished(page)) return false
    if (await this.isDeleted(page)) return false
    return await this.havePagePerm(page, 'unpublish')
  }

  async mayMove (page: Page) {
    if (!page.parentInternalId) return false // root page of a site/pagetree cannot be moved
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'move')
  }

  async mayDelete (page: Page) {
    if (!page.parentInternalId) return false // root page of a site/pagetree cannot be deleted
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'delete')
  }

  async mayUndelete (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'undelete')
  }

  /**
   * MUTATIONS
   */
  async movePages (dataIds: string[], targetId: string, above?: boolean) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(await this.mayCreate(parent)) || (await someAsync(pages, async (page: Page) => !(await this.mayMove(page))))) {
      throw new Error('You are not permitted to perform this move.')
    }

    if (pages.some(p => p.pagetreeId !== parent.pagetreeId)) throw new Error('Moving pages between sites or pagetrees is not allowed.')

    // movement between sites or pagetrees and already not allowed (see above)
    // and we would not want to disable movement just because an authorized person used a template
    // the current person can't use
    // therefore, skipping template validity check

    const newPages = await movePages(pages, parent, aboveTarget)
    return new PagesResponse({ success: true, pages: newPages })
  }

  async copyPages (dataIds: string[], targetId: string, above?: boolean, includeChildren?: boolean) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(await this.mayCreate(parent))) {
      throw new Error('You are not permitted to copy pages to this location.')
    }
    // Is this page allowed to be copied here?
    const pageData = await Promise.all(pages.map(async page => await this.raw.getData(page)))
    await Promise.all(pageData.map(async d => await this.validatePageTemplates(d, { parent })))
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
        if (!await this.svc(TemplateService).mayUseOnPage(templateByKey[templateKey], placement.page!)) throw new Error(`Template ${templateKey} is not approved for use in this site or pagetree.`)
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

  async validatePageData (data: PageData, site: Site | undefined, pagetree: Pagetree | undefined, parent: Page | undefined, name: string, linkId?: string, pageId?: string) {
    const response = new PageResponse({ success: true })
    const extras: PageExtras = {
      query: this.ctx.query,
      siteId: site?.id,
      pagetreeId: pagetree?.id,
      parentId: parent?.id,
      pagePath: `${parent ? await this.getPath(parent) : ''}/${name}`,
      pageId,
      linkId,
      name
    }
    const migrated = await migratePage(data, extras)
    const messages = await validatePage(migrated, extras)
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    return response
  }

  async createPage (name: string, data: PageData, targetId: string, above?: boolean, validateOnly?: boolean, extra?: CreatePageExtras) {
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(await this.mayCreate(parent))) throw new Error('Current user is not permitted to create pages in the specified parent.')
    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    await this.validatePageTemplates(data, { parent })
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(parent.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const response = await this.validatePageData(data, site, pagetree, parent, name)
    const pages = await this.raw.getPageChildren(parent, false)
    if (pages.some(p => p.name === name)) {
      response.addMessage('A page with this name already exists', 'name')
    }
    if (!validateOnly && response.success) {
      response.page = await createPage(this.svc(VersionedService), this.login, parent, aboveTarget, name, data, extra)
      this.loaders.clear()
    }
    return response
  }

  async updatePage (dataId: string, dataVersion: number, data: PageData, comment?: string, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.validatePageTemplates(data, { page })
    const parent = page.parentInternalId ? await this.findByInternalId(page.parentInternalId) : undefined
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const response = await this.validatePageData(data, site, pagetree, parent, page.name, page.linkId)
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(data)
      await this.svc(VersionedService).update(dataId, data, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async checkLatestVersion (dataId: string, dataVersion: number) {
    const latestVersion = await this.svc(VersionedService).get(dataId)
    if (!latestVersion) throw new Error('Page you are trying to update is corrupted. Please contact user support.')
    if (latestVersion.version !== dataVersion) throw new Error('Unable to update page. Another user has updated the page since you loaded it. Try again after refreshing.')
  }

  async pageExtras (page: Page) {
    const parent = page.parentInternalId ? await this.findByInternalId(page.parentInternalId) : undefined
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    return {
      query: this.ctx.query,
      siteId: site?.id,
      pagetreeId: pagetree?.id,
      parentId: parent?.id,
      pagePath: await this.raw.getPath(page),
      pageId: page.id,
      linkId: page.linkId,
      name: page.name
    } as PageExtras
  }

  async updatePageProperties (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, data: ComponentData, comment?: string, validateOnly?: boolean) {
    if (!data.templateKey) throw new Error('Component must have a templateKey.')
    delete data.areas
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)
    const extras = await this.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)
    if (migrated.templateKey !== data.templateKey) throw new Error('You may not change page templates while updating properties. Use changePageTemplate instead.')

    const response = new PageResponse({ success: true })
    const updated: PageData = { ...data, templateKey: migrated.templateKey, savedAtVersion: migrated.savedAtVersion, areas: migrated.areas }
    const fullymigrated = await migratePage(updated, extras)
    if (fullymigrated.templateKey !== data.templateKey) throw new Error('There was a problem interpreting this save. You may need to refresh the page and try again.')

    const validator = templateRegistry.getPageTemplate(fullymigrated.templateKey)?.validate
    const messages = (await validator?.(fullymigrated, extras)) ?? []
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
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
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)
    const extras = await this.pageExtras(page)
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
    const messages = (await validator?.(migratedComponent, { ...extras, page: fullymigrated, path })) ?? []
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async addComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, path: string, data: ComponentData, comment?: string, validateOnly?: boolean) {
    if (!data.templateKey) throw new Error('Component must have a templateKey.')
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion the UI was using
    const extras = await this.pageExtras(page)
    const migrated = await migratePage(pageData, extras, editedSchemaVersion)

    // perform the operation to add the component to the requested area or location
    const toParts = path.split('.')
    let toParentArray: ComponentData[]
    let toParentPath = path
    let toIdx = Number(toParts[toParts.length - 1])
    if (!isNaN(toIdx)) { // they gave us a desired ordering
      toParentPath = toParts.slice(0, -1).join('.')
      toParentArray = get<ComponentData[] | undefined>(migrated, toParentPath) ?? []
    } else { // they only gave us an area, insert at the end
      toParentArray = get<ComponentData[] | undefined>(migrated, toParentPath) ?? []
      if (!Array.isArray(toParentArray)) throw new Error('Invalid target path.')
      toIdx = toParentArray.length
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

    // run validations only on the new component and any areas beneath it
    const response = new PageResponse({ success: true })
    const messages = await validateRecurse({ ...extras, page: fullymigrated, path: compPath }, migratedComponent, compPath.split('.'))
    for (const message of messages) {
      response.addMessage(message.message, message.path, message.type as MutationMessageType)
    }

    // execute the mutation if appropriate
    if (!validateOnly && response.success) {
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async moveComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, fromPath: string, toPath: string, comment?: string) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion the UI was using
    const extras = await this.pageExtras(page)
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
      if (fromParentParts.length === toParentParts.length) finalIdx--
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
    await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
    this.loaders.clear()
    page = await this.raw.findById(dataId)
    const response = new PageResponse({ success: true })
    response.page = page
    return response
  }

  async deleteComponent (dataId: string, dataVersion: number, editedSchemaVersion: DateTime, path: string, comment?: string) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.checkLatestVersion(dataId, dataVersion)
    const pageData = await this.raw.getData(page, dataVersion)

    // migrate the stored page data to match the schemaversion of the admin UI
    const parent = page.parentInternalId ? await this.findByInternalId(page.parentInternalId) : undefined
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const extras: PageExtras = {
      query: this.ctx.query,
      siteId: site?.id,
      pagetreeId: pagetree?.id,
      parentId: parent?.id,
      pagePath: await this.raw.getPath(page),
      pageId: page.id,
      linkId: page.linkId,
      name: page.name
    }
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
    await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
    this.loaders.clear()
    page = await this.raw.findById(dataId)
    const response = new PageResponse({ success: true })
    response.page = page
    return response
  }

  async changePageTemplate (dataId: string, templateKey: string, dataVersion?: number, comment?: string, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    const pageData = await this.raw.getData(page, dataVersion)

    const extras = await this.pageExtras(page)
    const fullymigrated = await migratePage(pageData, extras)

    const template = await this.svc(TemplateServiceInternal).findByKey(templateKey)
    if (!template) throw new Error(`Tried to set page template to a non-existing template ${templateKey}.`)
    if (template.type !== TemplateType.PAGE) throw new Error(`Tried to set page template to a non-page template ${templateKey}.`)
    const response = new PageResponse({ success: true })
    if (!await this.svc(TemplateService).mayUseOnPage(template, page)) response.addMessage('You are not permitted to use that template here.')

    if (!validateOnly && response.success) {
      fullymigrated.templateKey = templateKey
      const indexes = getPageIndexes(fullymigrated)
      await this.svc(VersionedService).update(dataId, fullymigrated, indexes, { user: this.login, comment, version: dataVersion })
      this.loaders.clear()
      page = await this.raw.findById(dataId)
    }
    response.page = page
    return response
  }

  async renamePage (dataId: string, name: string, validateOnly?: boolean) {
    const page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot rename a page that does not exist.')
    if (!(await this.mayMove(page))) throw new Error('Current user is not permitted to rename this page')
    const response = new PageResponse({ success: true })
    if (isNotNull(page.parentInternalId)) {
      const parent = await this.raw.findByInternalId(page.parentInternalId)
      const siblings = await this.raw.getPageChildren(parent!, false)
      if (name !== page.name && siblings.some(p => p.name === name)) {
        response.addMessage('A page with this name already exists in this location', 'name')
      }
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
    if (await someAsync(pages, async (page: Page) => !(await this.mayDelete(page)))) {
      throw new Error('Current user is not permitted to delete one or more pages')
    }
    const currentUser = await this.currentUser()
    try {
      await deletePages(this.svc(VersionedService), pages, currentUser!.internalId)
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
    if (await someAsync(pages, async (page: Page) => !(await this.mayDelete(page)))) {
      throw new Error('Current user is not permitted to delete one or more pages')
    }
    const currentUser = await this.currentUser()
    await publishPageDeletions(pages, currentUser!.internalId)
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
    if (await someAsync(pages, async (page: Page) => !(await this.mayUndelete(page)))) {
      throw new Error('Current user is not permitted to restore one or more pages')
    }
    try {
      await undeletePages(pages)
      this.loaders.clear()
      const restored = await this.raw.findByIds(dataIds)
      return new PagesResponse({ success: true, pages: restored })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to restore page')
    }
  }

  async publishPages (dataIds: string[], includeChildren?: boolean) {
    let pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (includeChildren) {
      const children = (await Promise.all(pages.map(async (page) => await this.getPageChildren(page, true)))).flat()
      pages = [...pages, ...children]
    }
    if (await someAsync(pages, async (page: Page) => !(await this.mayPublish(page, true)))) {
      throw new Error('Current user is not permitted to publish one or more pages')
    }
    pages = pages.filter(p => !p.deleted)
    try {
      await db.transaction(async db => {
        for (const p of pages) await this.svc(VersionedService).tag(p.dataId, 'published', undefined, this.login)
      })
      this.loaders.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to publish one or more pages.')
    }
  }

  async unpublishPages (dataIds: string[]) {
    let pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const children = (await Promise.all(pages.flatMap(async (page) => await this.getPageChildren(page, true)))).flat()
    pages = [...pages, ...children]
    if (await someAsync(pages, async (page: Page) => !(await this.mayUnpublish(page)))) {
      throw new Error('Current user is not permitted to unpublish one or more pages')
    }
    try {
      await db.transaction(async db => {
        for (const p of pages) await this.svc(VersionedService).removeTag(p.dataId, 'published')
      })
      this.loaders.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to unpublish one or more pages')
    }
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
