import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { TemplateFilter, getTemplates, getTemplatesByPagetree, getTemplatesBySite } from 'internal'

const templatesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getTemplates({ ids })
  }
})
const templatesByKeyLoader = new PrimaryKeyLoader({
  fetch: async (keys: string[]) => {
    return await getTemplates({ keys })
  },
  extractId: tmpl => tmpl.key,
  idLoader: templatesByIdLoader
})
templatesByIdLoader.addIdLoader(templatesByKeyLoader)

const templatesBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[], filter?: TemplateFilter) => {
    return await getTemplatesBySite(siteIds, filter)
  },
  idLoader: [templatesByIdLoader, templatesByKeyLoader]
})

const templatesByPagetreeIdLoader = new ManyJoinedLoader({
  fetch: async (pagetreeIds: string[], filter?: TemplateFilter) => {
    return await getTemplatesByPagetree(pagetreeIds, filter)
  },
  idLoader: [templatesByIdLoader, templatesByKeyLoader]
})

export class TemplateService extends AuthorizedService {
  async find (filter?: TemplateFilter) {
    return await getTemplates(filter)
  }

  async findById (id: number) {
    return await this.loaders.get(templatesByIdLoader).load(id)
  }

  async findByKey (key: string) {
    return await this.loaders.get(templatesByKeyLoader).load(key)
  }

  async findByKeys (keys: string[]) {
    return await this.loaders.loadMany(templatesByKeyLoader, keys)
  }

  async findBySiteId (siteId: string, filter?: TemplateFilter) {
    return await this.loaders.get(templatesBySiteIdLoader, filter).load(siteId)
  }

  async findByPagetreeId (pagetreeId: string, filter?: TemplateFilter) {
    return await this.loaders.get(templatesByPagetreeIdLoader, filter).load(pagetreeId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
