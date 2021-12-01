import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Data, DataFilter } from './data.model'
import { getData } from './data.database'

const dataByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter?: DataFilter) => {
    return await getData({ ...filter, folderInternalIds })
  },
  extractKey: (item: Data) => item.folderInternalId!,
  keysFromFilter: (filter: DataFilter | undefined) => filter?.folderInternalIds ?? []
})

export class DataService extends AuthorizedService {
  async find (filter: DataFilter) {
    return await getData(filter)
  }

  async findByFolderInternalId (folderId: number, filter?: DataFilter) {
    return await this.loaders.get(dataByFolderInternalIdLoader, filter).load(folderId)
  }

  async mayView (data: Data): Promise<boolean> {
    return true
  }
}
