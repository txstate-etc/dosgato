import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import stringify from 'fast-json-stable-stringify'
import { Page, PageFilter } from './page.model'
import { getPages, movePage } from './page.database'
import { intersect, isNotNull, unique } from 'txstate-utils'
import { VersionedService } from '../versionedservice'
import { PageLinkInput, PageResponse } from '.'
import { templateRegistry } from '../util/registry'

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

export class PageService extends AuthorizedService {
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

  async getPageChildren (page: Page, recursive?: boolean) {
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

  async mayView (): Promise<boolean> {
    return true
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
  async movePage (dataId: string, newParentDataId: string) {
    const resp = new PageResponse()
    // TODO make sure the user is permitted to move the page into the chosen parent
    // they need the move permission on the page and createPage on the parent
    resp.page = await movePage(dataId, newParentDataId)
    resp.success = true
    return resp
  }
}
