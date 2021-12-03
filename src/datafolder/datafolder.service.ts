import { AuthorizedService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader, OneToManyLoader } from 'dataloader-factory'
import { DataFolder, DataFolderFilter } from './datafolder.model'
import { getDataFolders } from './datafolder.database'

const dataFoldersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getDataFolders({ internalIds })
  },
  extractId: (item: DataFolder) => item.internalId
})

const dataFoldersBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: DataFolderFilter) => {
    return await getDataFolders({ ...filter, siteIds })
  },
  extractKey: (d: DataFolder) => d.siteId,
  keysFromFilter: (filter: DataFolderFilter | undefined) => filter?.siteIds ?? []
})

export class DataFolderService extends AuthorizedService {
  async findByInternalId (id: number) {
    return await this.loaders.get(dataFoldersByInternalIdLoader).load(id)
  }

  async findBySiteId (siteId: string, filter?: DataFolderFilter) {
    return await this.loaders.get(dataFoldersBySiteIdLoader, filter).load(siteId)
  }

  async mayView (folder: DataFolder): Promise<boolean> {
    return true
  }
}
