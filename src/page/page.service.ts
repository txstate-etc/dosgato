import { PageData, PageExtras, PageLink } from '@dosgato/templating'
import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { nanoid } from 'nanoid'
import { eachConcurrent, filterAsync, intersect, isNotNull, keyby, mapConcurrent, someAsync, stringify, unique } from 'txstate-utils'
import {
  VersionedService, templateRegistry, DosGatoService, Page, PageFilter,
  PageResponse, PagesResponse, createPage, getPages, movePages,
  deletePages, renamePage, TemplateService,
  TemplateFilter, getPageIndexes, undeletePages,
  validatePage, DeletedFilter, copyPages, TemplateType, migratePage,
  Pagetree, PagetreeServiceInternal, collectTemplates, TemplateServiceInternal, SiteServiceInternal, Site, PagetreeType, DeleteState, publishPageDeletions
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

const pagesByPathLoader = new OneToManyLoader({
  fetch: async (paths: string[], filters: PageFilter) => {
    return await getPages({ ...filters, paths })
  },
  extractKey: p => p.path
})

export class PageServiceInternal extends BaseService {
  async find (filter: PageFilter) {
    filter = await this.processFilters(filter)

    // TODO: move this to processFilters?
    if (filter.linkIdsReferenced?.length) {
      const searchRule = { indexName: 'link_page', in: filter.linkIdsReferenced.map(linkId => (stringify({ linkId }))) }
      const [dataIdsLatest, dataIdsPublished] = await Promise.all([
        this.svc(VersionedService).find([searchRule], 'latest'),
        this.svc(VersionedService).find([searchRule], 'published')])
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
    const searchRule = { indexName: 'template', equal: key }
    const [dataIdsLatest, dataIdsPublished] = await Promise.all([
      this.svc(VersionedService).find([searchRule], 'latest'),
      this.svc(VersionedService).find([searchRule], 'published')])
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
    if (filter.referencedByPageIds?.length) {
      // TODO: refactor this to use VersionedService indexes instead of rescanning the data
      const verService = this.svc(VersionedService)
      const pages = (await Promise.all(filter.referencedByPageIds.map(async id => await this.findById(id)))).filter(isNotNull)
      const pagedata = (await Promise.all(pages.map(async page => await verService.get<PageData>(page.dataId, { tag: filter.published ? 'published' : undefined })))).filter(isNotNull)
      const links = pagedata.flatMap(d => templateRegistry.get(d.data.templateKey).getLinks?.(d.data) ?? []).filter(l => l.type === 'page') as PageLink[]
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
            this.loaders.get(pagesByPathLoader, { pagetreeIds: [contextPagetree.id] }).load(l.path)
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
        return pages.find(p => p.length > 1)?.[0]
      }))
      filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, pages.filter(isNotNull).map(p => p.internalId))
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
    return await filterAsync(templates, async template => await this.svc(TemplateService).mayUseOnPage(template, page.id))
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

  // authenticated user may create pages underneath given page
  async mayCreate (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'create')
  }

  async mayUpdate (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'update')
  }

  async mayPublish (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'publish')
  }

  async mayUnpublish (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'unpublish')
  }

  async mayMove (page: Page) {
    if (await this.isInArchive(page)) return false
    return await this.havePagePerm(page, 'move')
  }

  async mayDelete (page: Page) {
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
      throw new Error('Current user is not permitted to perform this move.')
    }
    const newPages = await movePages(pages, parent, aboveTarget)
    return new PagesResponse({ success: true, pages: newPages })
  }

  async copyPages (dataIds: string[], targetId: string, above?: boolean, includeChildren?: boolean) {
    const pages = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(await this.mayCreate(parent))) {
      throw new Error('Current user is not permitted to copy pages to this location.')
    }
    // Is this page allowed to be copied here?
    const pageData = (await mapConcurrent(pages, async page => await this.svc(VersionedService).get(page.id))).filter(isNotNull)
    await eachConcurrent(pageData, async d => await this.validatePageTemplates(parent, d.data, true))
    const newPage = await copyPages(this.svc(VersionedService), this.login, pages, parent, aboveTarget, includeChildren)
    return new PageResponse({ success: true, page: newPage })
  }

  async validatePageTemplates (page: Page, data: PageData, create: boolean) {
    const templateKeys = Array.from(collectTemplates(data))
    const templates = await Promise.all(templateKeys.map(async k => await this.svc(TemplateServiceInternal).findByKey(k)))
    const templateByKey = keyby(templates.filter(isNotNull), 'key')
    const oldData = await this.raw.getData(page)
    if (oldData.templateKey !== data.templateKey) {
      if (!templateByKey[data.templateKey]) throw new Error('Tried to set page template to a non-existing template.')
      if (templateByKey[data.templateKey].type !== TemplateType.PAGE) throw new Error('Tried to set page template to a non-page template.')
    }

    const invalid = create
      ? await someAsync(templateKeys, async templateKey => !await this.svc(TemplateService).mayUseOnPage(templateByKey[templateKey], page.id))
      : await someAsync(templateKeys, async templateKey => !await this.svc(TemplateService).mayKeepOnPage(templateKey, page, templateByKey[templateKey]))
    if (invalid) throw new Error('Template is not approved for use in this site or pagetree.')
  }

  async validatePageData (data: PageData, site: Site | undefined, pagetree: Pagetree | undefined, parent: Page | undefined, name: string, linkId: string, pageId?: string) {
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

  async createPage (name: string, data: PageData, targetId: string, above?: boolean, validateOnly?: boolean) {
    const { parent, aboveTarget } = await this.resolveTarget(targetId, above)
    if (!(await this.mayCreate(parent))) throw new Error('Current user is not permitted to create pages in the specified parent.')
    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    await this.validatePageTemplates(parent, data, true)
    const pagetree = (await this.svc(PagetreeServiceInternal).findById(parent.pagetreeId))!
    const site = (await this.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const linkId = nanoid(10)
    const response = await this.validatePageData(data, site, pagetree, parent, name, linkId)
    const pages = await this.raw.getPageChildren(parent, false)
    if (pages.some(p => p.name === name)) {
      response.addMessage('A page with this name already exists', 'name')
    }
    if (!validateOnly && response.success) {
      response.page = await createPage(this.svc(VersionedService), this.login, parent, aboveTarget, name, data, linkId)
      this.loaders.clear()
    }
    return response
  }

  async updatePage (dataId: string, dataVersion: number, data: PageData, comment?: string, validateOnly?: boolean) {
    let page = await this.raw.findById(dataId)
    if (!page) throw new Error('Cannot update a page that does not exist.')
    if (!(await this.mayUpdate(page))) throw new Error(`Current user is not permitted to update page ${String(page.name)}`)
    await this.validatePageTemplates(page, data, false)
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
    // TODO: Should they be able to delete the root page of the pagetree?
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
    console.log(`includeChildren: ${includeChildren}`)
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
    if (await someAsync(pages, async (page: Page) => !(await this.mayPublish(page)))) {
      throw new Error('Current user is not permitted to publish one or more pages')
    }
    pages = pages.filter(p => !p.deleted)
    try {
      await eachConcurrent(pages.map(p => p.dataId), async (dataId) => await this.svc(VersionedService).tag(dataId, 'published', undefined, this.login))
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
      await eachConcurrent(pages.map(p => p.id), async (dataId) => await this.svc(VersionedService).removeTag(dataId, 'published'))
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
