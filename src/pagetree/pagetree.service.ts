import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { PageTree, PageTreeFilter } from './pagetree.model'
import { getPagetreesBySite } from './pagetree.database'

const PagetreesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: number[], filter?: PageTreeFilter) => {
    return await getPagetreesBySite(siteIds, filter)
  },
  extractKey: (p: PageTree) => p.siteId
})

export class PageTreeService extends AuthorizedService {
  async findBySiteId (siteId: string, filter?: PageTreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(Number(siteId))
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
