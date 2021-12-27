import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Pagetree, PagetreeFilter, getPagetreesById, getPagetreesBySite, getPagetreesByTemplate } from 'internal'

const PagetreesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPagetreesById(ids)
  }
})
const PagetreesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: PagetreeFilter) => {
    return await getPagetreesBySite(siteIds, filter)
  },
  extractKey: (p: Pagetree) => p.siteId,
  idLoader: PagetreesByIdLoader
})

const PagetreesByTemplateIdLoader = new ManyJoinedLoader({
  fetch: async (templateIds: number[], direct?: boolean) => {
    return await getPagetreesByTemplate(templateIds, direct)
  },
  idLoader: PagetreesByIdLoader
})

export class PagetreeService extends AuthorizedService {
  async findById (id: string) {
    return await this.loaders.get(PagetreesByIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: PagetreeFilter) {
    return await this.loaders.get(PagetreesBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplateId (templateId: number, direct?: boolean) {
    return await this.loaders.get(PagetreesByTemplateIdLoader, direct).load(templateId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
