import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { TemplateFilter } from './template.model'
import { getTemplates, getTemplatesBySite } from './template.database'

const templatesBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[], filter?: TemplateFilter) => {
    return await getTemplatesBySite(siteIds, filter)
  }
})

export class TemplateService extends AuthorizedService {
  async find (filter?: TemplateFilter) {
    return await getTemplates(filter)
  }

  async findBySiteId (siteId: string, filter?: TemplateFilter) {
    return await this.loaders.get(templatesBySiteIdLoader, filter).load(siteId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
