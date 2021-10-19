import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { PageTree, PageTreeFilter } from './pagetree.model'
import { getPagetreesById, getPagetreesBySite, getPagetreesByTemplate } from './pagetree.database'

const PagetreesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPagetreesById(ids)
  }
})
const PagetreesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: PageTreeFilter) => {
    return await getPagetreesBySite(siteIds, filter)
  },
  extractKey: (p: PageTree) => p.siteId,
  idLoader: PagetreesByIdLoader
})

const PagetreesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], direct?: boolean) => {
    return await getPagetreesByTemplate(templateIds, direct)
  },
  idLoader: PagetreesByIdLoader
})

export class PageTreeService extends AuthorizedService {
  async findById (id: string) {
    return await this.loaders.get(PagetreesByIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: PageTreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    console.log(templateId)
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
