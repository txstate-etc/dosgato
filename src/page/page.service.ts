import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import stringify from 'fast-json-stable-stringify'
import { intersect, isNotNull, isNull, unique } from 'txstate-utils'
import {
  VersionedService, templateRegistry, DosGatoService, Page, PageFilter,
  CreatePageInput, PageLinkInput, PageResponse, createPage, getPages, movePage,
  deletePage, renamePage, TemplateService, PagetreeService, SiteService,
  TemplateFilter, Template
} from 'internal'

const pagesByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getPages({ internalIds })
  },
  extractId: (item: Page) => item.internalId
})

const pagesByDataIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPages({ ids })
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
  fetch: async (internalIdPaths: string[]) => {
    return await getPages({ internalIdPaths })
  },
  extractKey: (p: Page) => p.path,
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

const pagesByInternalIdPathRecursiveLoader = new OneToManyLoader({
  fetch: async (internalIdPathsRecursive: string[]) => {
    const pages = await getPages({ internalIdPathsRecursive })
    return pages
  },
  matchKey: (path: string, p: Page) => p.path.startsWith(path),
  idLoader: [pagesByInternalIdLoader, pagesByDataIdLoader]
})

export class PageService extends DosGatoService {
  async find (filter: PageFilter) {
    filter = await this.processFilters(filter)
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
    return await getPages(filter)
  }

  async findById (id: string) {
    return await this.loaders.get(pagesByDataIdLoader).load(id)
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
      this.svc(VersionedService).find([searchRule], 'latest'),
      this.svc(VersionedService).find([searchRule], 'published')])
    let dataIds = unique([...dataIdsLatest, ...dataIdsPublished])
    if (!dataIds.length) return []
    if (filter?.ids?.length) {
      dataIds = dataIds.filter(i => filter.ids?.includes(i))
    }
    return await this.find({ ids: dataIds })
  }

  async getPageChildren (page: Page, recursive?: boolean) {
    const loader = recursive ? pagesByInternalIdPathRecursiveLoader : pagesByInternalIdPathLoader
    return await this.loaders.get(loader).load(`${page.path}${page.path === '/' ? '' : '/'}${page.internalId}`)
  }

  async getPageAncestors (page: Page) {
    return await this.loaders.loadMany(pagesByInternalIdLoader, page.pathSplit)
  }

  async getApprovedTemplates (page: Page, filter?: TemplateFilter) {
    const pageTree = await this.svc(PagetreeService).findById(page.pagetreeId)
    const site = await this.svc(SiteService).findByPagetreeId(pageTree!.id)
    const [pagetreeTemplates, siteTemplates] = await Promise.all([
      this.svc(TemplateService).findByPagetreeId(page.pagetreeId, filter),
      this.svc(TemplateService).findBySiteId(site!.id, filter)
    ])
    let templatesAuthForUser: Template[] = []
    const templateRules = await this.currentTemplateRules()
    // If there is a template rule that applies to all templates, this user can use all templates anywhere
    // TODO: Should this be filtered by template type too? It doesn't make sense to have page templates approved
    // for use in a page, but this could return all three template types
    if (templateRules.some(r => isNull(r.templateId) && r.grants.use)) {
      templatesAuthForUser = await this.svc(TemplateService).find()
    } else {
      const rules = templateRules.filter(r => isNotNull(r.templateId) && r.grants.use)
      let ids = rules.map(r => r.templateId!)
      if (filter?.ids?.length) {
        ids = ids.filter(i => filter.ids?.includes(i))
      }
      if (ids) templatesAuthForUser = await this.svc(TemplateService).find({ ids })
    }
    return unique([...pagetreeTemplates, ...siteTemplates, ...templatesAuthForUser], 'id')
  }

  async getRootPage (page: Page) {
    const rootId = page.pathSplit[0]
    if (!rootId) return page
    return await this.findByInternalId(rootId)
  }

  async getPath (page: Page) {
    const ancestors = await this.getPageAncestors(page)
    return `/${ancestors.map(a => a.name).join('/')}${ancestors.length ? '/' : ''}${page.name as string}`
  }

  async mayView (page: Page) {
    if (await this.havePagePerm(page, 'view')) return true
    // if we are able to view any child pages, we have to be able to view the ancestors so that we can draw the tree
    const children = await this.getPageChildren(page, true)
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

  // authenticated user may create pages underneath given page
  async mayCreate (page: Page) {
    return await this.havePagePerm(page, 'create')
  }

  async mayUpdate (page: Page) {
    return await this.havePagePerm(page, 'update')
  }

  async mayPublish (page: Page) {
    return await this.havePagePerm(page, 'publish')
  }

  async mayUnpublish (page: Page) {
    return await this.havePagePerm(page, 'unpublish')
  }

  async mayMove (page: Page) {
    return await this.havePagePerm(page, 'move')
  }

  async mayDelete (page: Page) {
    return await this.havePagePerm(page, 'delete')
  }

  async mayUndelete (page: Page) {
    return await this.havePagePerm(page, 'undelete')
  }

  async processFilters (filter: PageFilter) {
    if (filter.referencedByPageIds?.length) {
      const verService = this.svc(VersionedService)
      const pages = (await Promise.all(filter.referencedByPageIds.map(async id => await this.findById(id)))).filter(isNotNull)
      const pagedata = (await Promise.all(pages.map(async page => await verService.get(page.dataId, { tag: filter.published ? 'published' : undefined })))).filter(isNotNull)
      const links = pagedata.flatMap(d => templateRegistry.get(d.data.templateKey).getLinks(d.data)).filter(l => l.type === 'page') as PageLinkInput[]
      filter.links = intersect({ skipEmpty: true, by: lnk => stringify({ ...lnk, type: 'page' }) }, links, filter.links)
    }
    return filter
  }

  /**
   * MUTATIONS
   */
  async movePage (dataId: string, targetId: string, above?: boolean) {
    const [page, { parent, aboveTarget }] = await Promise.all([this.findById(dataId), this.resolveTarget(targetId, above)])
    if (!page) throw new Error('Cannot move page that does not exist.')
    if (!(await this.mayCreate(parent)) || !(await this.mayMove(page))) throw new Error('Current user is not permitted to perform this move.')
    const newPage = await movePage(page, parent, aboveTarget)
    return new PageResponse({ success: true, page: newPage })
  }

  async createPage (args: CreatePageInput) {
    const { parent, aboveTarget } = await this.resolveTarget(args.targetId, args.above)
    if (!(await this.mayCreate(parent))) throw new Error('Current user is not permitted to create pages in the specified parent.')
    // TODO check page template to see if it's permitted
    const page = await createPage(this.svc(VersionedService), this.auth!.login, parent, aboveTarget, args.name, args.templateKey, args.schemaVersion)
    return new PageResponse({ success: true, page })
  }

  async renamePage (dataId: string, name: string) {
    const page = await this.findById(dataId)
    if (!page) throw new Error('Cannot rename a page that does not exist.')
    if (!(await this.mayMove(page))) throw new Error('Current user is not permitted to rename this page')
    try {
      await renamePage(page, name)
      this.loaders.clear()
      const updated = await this.findById(dataId)
      return new PageResponse({ success: true, page: updated })
    } catch (err: any) {
      console.log(err)
      throw new Error('An unknown error ocurred while trying to delete a page.')
    }
  }

  async deletePage (dataId: string) {
    // TODO: Should they be able to delete the root page of the pagetree?
    const page = await this.findById(dataId)
    if (!page) throw new Error('Cannot delete a page that does not exist.')
    if (!(await this.mayDelete(page))) throw new Error('Current user is not permitted to delete this page')
    const currentUser = await this.currentUser()
    try {
      await deletePage(page, currentUser!.internalId)
      this.loaders.clear()
      const updated = await this.findById(dataId)
      return new PageResponse({ success: true, page: updated })
    } catch (err: any) {
      console.log(err)
      throw new Error('An unknown error ocurred while trying to delete a page.')
    }
  }

  /**
   * Mutation Helpers
   */
  async resolveTarget (targetId: string, above?: boolean) {
    const target = await this.findById(targetId)
    let parent = target
    let aboveTarget
    if (above) {
      parent = target?.parentInternalId ? await this.findByInternalId(target.parentInternalId) : undefined
      aboveTarget = target
    }
    if (!parent) throw new Error('Target selection not appropriate.')
    return { parent, aboveTarget }
  }
}
