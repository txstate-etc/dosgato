import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ManyJoinedLoader } from 'dataloader-factory'
import { PageTree, PageTreeFilter } from './pagetree.model'
import { getPagetreesBySite, getPagetreesByTemplate } from './pagetree.database'

const PagetreesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: PageTreeFilter) => {
    return await getPagetreesBySite(siteIds, filter)
  },
  extractKey: (p: PageTree) => p.siteId
})

const PagetreesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], direct?: boolean) => {
    return await getPagetreesByTemplate(templateIds, direct)
  }
})

export class PageTreeService extends AuthorizedService {
  async findBySiteId (siteId: string, filter?: PageTreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    console.log(templateId)
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }

  async mayView (pageTree: PageTree) {
    return true
  }
}
