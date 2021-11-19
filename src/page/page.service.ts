import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Page, PageFilter } from './page.model'
import { getPages } from './page.database'
import { isNotNull, isNull, unique } from 'txstate-utils'
import { VersionedService } from '../versionedservice'
import stringify from 'fast-json-stable-stringify'

const pagesByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getPages({ internalIds })
  },
  extractId: (item: Page) => item.internalId
})

const pagesInPagetreeLoader = new OneToManyLoader({
  fetch: async (pagetreeIds: string[], filter?: PageFilter) => {
    return await getPages({ ...filter, pagetreeIds })
  },
  extractKey: (p: Page) => p.pagetreeId,
  keysFromFilter: (filter: PageFilter | undefined) => filter?.pagetreeIds ?? [],
  idLoader: pagesByInternalIdLoader
})

const pagesByParentIdLoader = new OneToManyLoader({
  fetch: async (parentInternalIds: number[]) => {
    return await getPages({ parentInternalIds })
  },
  extractKey: (p: Page) => p.parentInternalId!
})

export class PageService extends AuthorizedService {
  async find (filter: PageFilter) {
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

  async findByInternalId (id: number) {
    return await this.loaders.get(pagesByInternalIdLoader).load(id)
  }

  async findByPagetreeId (id: string, filter?: PageFilter) {
    return await this.loaders.get(pagesInPagetreeLoader, filter).load(id)
  }

  async getPageChildren (pageId: number, recursive?: boolean) {
    if (recursive) {
      const descendents: Page[] = []
      await this.#getChildren(pageId, descendents)
      return descendents
    } else {
      return await this.loaders.get(pagesByParentIdLoader).load(pageId)
    }
  }

  async getPageAncestors (pageId: number) {
    const ancestors: Page[] = []
    let page = await this.loaders.get(pagesByInternalIdLoader).load(pageId)
    while (page && isNotNull(page.parentInternalId)) {
      page = await this.loaders.get(pagesByInternalIdLoader).load(page.parentInternalId)
      if (page) ancestors.push(page)
    }
    return ancestors
  }

  async getRootPage (pageId: number) {
    const ancestors = await this.getPageAncestors(pageId)
    return ancestors.find((page: Page) => isNull(page.parentInternalId))
  }

  async mayView (): Promise<boolean> {
    return true
  }

  async #getChildren (parentId: number, descendents: Page[]) {
    const children = await this.loaders.get(pagesByParentIdLoader).load(parentId)
    descendents.push(...children)
    const promises: Promise<void>[] = []
    for (const child of children) {
      promises.push(this.#getChildren(child.internalId, descendents))
    }
    await Promise.all(promises)
  }
}
