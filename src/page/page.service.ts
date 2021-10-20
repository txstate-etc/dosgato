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
  fetch: async (pageTreeIds: string[]) => {
    return await getPages({ pageTreeIds })
  },
  extractKey: (p: Page) => p.pageTreeId,
  idLoader: pagesByIdLoader
})

export class PageService extends AuthorizedService {
  async find (filter: PageFilter) {
    return await getPages(filter)
  }

  async findById (id: string) {
    return await this.loaders.get(pagesByIdLoader).load(id)
  }

  async getPageChildren (pageId: string, pagetreeId: string, recursive?: boolean) {
    const pagetreePages = await this.loaders.get(pagesInPagetreeLoader).load(pagetreeId)
    if (recursive) {
      const descendents: Page[] = []
      return getChildren(pageId, pagetreePages, descendents)
    } else {
      return pagetreePages.filter(p => p.parentId === pageId)
    }
  }

  async getPageAncestors (pageId: string, pagetreeId: string) {
    await this.loaders.get(pagesInPagetreeLoader).load(pagetreeId)
    const ancestors: Page[] = []
    let page = await this.loaders.get(pagesByIdLoader).load(pageId)
    while (page && isNotNull(page.parentId)) {
      page = await this.loaders.get(pagesByIdLoader).load(page.parentId)
      if (page) ancestors.push(page)
    }
    return ancestors
  }

  async getRootPage (pagetreeId: string) {
    const pagetreePages = await this.loaders.get(pagesInPagetreeLoader).load(pagetreeId)
    return pagetreePages.find(p => isNull(p.parentId))
  }

  async mayView (): Promise<boolean> {
    return true
  }
}

const getChildren = function (parentId: string, pagetreePages: Page[], descendents: Page[]) {
  const children: Page[] = pagetreePages.filter(p => p.parentId === parentId)
  descendents.push(...children)
  for (const page of children) {
    getChildren(page.id, pagetreePages, descendents)
  }
}
