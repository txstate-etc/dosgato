import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Data, DataFilter } from './data.model'
import { getData } from './data.database'
import { VersionedService } from '../versionedservice'
import { unique } from 'txstate-utils'

const dataByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter?: DataFilter) => {
    return await getData({ ...filter, folderInternalIds })
  },
  extractKey: (item: Data) => item.folderInternalId!,
  keysFromFilter: (filter: DataFilter | undefined) => filter?.folderInternalIds ?? []
})

export class DataService extends AuthorizedService {
  async find (filter: DataFilter) {
    filter = await this.processFilters(filter)
    return await getData(filter)
  }

  async findByFolderInternalId (folderId: number, filter?: DataFilter) {
    return await this.loaders.get(dataByFolderInternalIdLoader, filter).load(folderId)
  }

  async mayView (data: Data): Promise<boolean> {
    return true
  }

  async processFilters (filter: DataFilter) {
    if (filter.templateKeys?.length) {
      const searchRule = { indexName: 'templateKey', in: filter.templateKeys }
      const dataIds = await this.svc(VersionedService).find([searchRule], 'latest')
      if (filter.ids?.length) {
        filter.ids.push(...dataIds)
        filter.ids = unique(filter.ids)
      } else filter.ids = dataIds
    }
    return filter
  }
}
