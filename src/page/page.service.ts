import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Page, PageFilter } from './page.model'
import { getPages } from './page.database'
import { isNotNull, isNull } from 'txstate-utils'

const pagesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPages({ ids })
  }
})

const pagesInPagetreeLoader = new OneToManyLoader({
  fetch: async (pageTreeIds: string[], filter?: PageFilter) => {
    return await getPages({ ...filter, pageTreeIds })
  },
  extractKey: (p: Page) => p.pageTreeId,
  keysFromFilter: (filter: PageFilter | undefined) => filter?.pageTreeIds ?? [],
  idLoader: pagesByIdLoader
})

export class PageService extends AuthorizedService {
  async find (filter: PageFilter) {
    return await getPages(filter)
  }

  async findById (id: string) {
    return await this.loaders.get(pagesByIdLoader).load(id)
  }

  async findByPagetreeId (id: string, filter?: PageFilter) {
    return await this.loaders.get(pagesInPagetreeLoader, filter).load(id)
  }

  async getPageChildren (pageId: string, recursive?: boolean) {
    if (recursive) {
      const descendents: Page[] = []
      await this.#getChildren(pageId, descendents)
      return descendents
    } else {
      return await this.find({ parentPageIds: [pageId] })
    }
  }

  async getPageAncestors (pageId: string) {
    const ancestors: Page[] = []
    let page = await this.loaders.get(pagesByIdLoader).load(pageId)
    while (page && isNotNull(page.parentId)) {
      page = await this.loaders.get(pagesByIdLoader).load(page.parentId)
      if (page) ancestors.push(page)
    }
    return ancestors
  }

  async getRootPage (pageId: string) {
    const ancestors = await this.getPageAncestors(pageId)
    return ancestors.find((page: Page) => isNull(page.parentId))
  }

  async mayView (): Promise<boolean> {
    return true
  }

  async #getChildren (parentId: string, descendents: Page[]) {
    const children = await this.find({ parentPageIds: [parentId] })
    descendents.push(...children)
    const promises: Promise<void>[] = []
    for (const child of children) {
      promises.push(this.#getChildren(child.id, descendents))
    }
    await Promise.all(promises)
  }
}
