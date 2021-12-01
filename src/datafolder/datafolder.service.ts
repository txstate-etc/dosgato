import { AuthorizedService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader } from 'dataloader-factory'
import { DataFolder } from './datafolder.model'
import { getDataFolders } from './datafolder.database'

const dataFoldersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getDataFolders(internalIds)
  },
  extractId: (item: DataFolder) => item.internalId
})

export class DataFolderService extends AuthorizedService {
  async findByInternalId (id: number) {
    return await this.loaders.get(dataFoldersByInternalIdLoader).load(id)
  }

  async mayView (folder: DataFolder): Promise<boolean> {
    return true
  }
}
