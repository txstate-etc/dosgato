import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader, OneToManyLoader } from 'dataloader-factory'
import { DataFolder, DataFolderFilter, DosGatoService, getDataFolders, DataService, DataServiceInternal } from 'internal'

const dataFoldersByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getDataFolders({ ids })
  },
  extractId: (item: DataFolder) => item.id
})

const dataFoldersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getDataFolders({ internalIds })
  },
  extractId: (item: DataFolder) => item.internalId,
  idLoader: dataFoldersByIdLoader
})
dataFoldersByIdLoader.addIdLoader(dataFoldersByInternalIdLoader)

const dataFoldersBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: DataFolderFilter) => {
    return await getDataFolders({ ...filter, siteIds })
  },
  extractKey: (d: DataFolder) => d.siteId!,
  keysFromFilter: (filter: DataFolderFilter | undefined) => filter?.siteIds ?? []
})

export class DataFolderServiceInternal extends BaseService {
  async findById (id: string) {
    return await this.loaders.get(dataFoldersByIdLoader).load(id)
  }

  async findByInternalId (internalId: number) {
    return await this.loaders.get(dataFoldersByInternalIdLoader).load(internalId)
  }

  async findBySiteId (siteId: string, filter?: DataFolderFilter) {
    return await this.loaders.get(dataFoldersBySiteIdLoader, filter).load(siteId)
  }

  async getPath (folder: DataFolder) {
    return '/' + (folder.name as string)
  }
}

export class DataFolderService extends DosGatoService<DataFolder> {
  raw = this.svc(DataFolderServiceInternal)

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByInternalId (internalId: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findBySiteId (siteId: string, filter?: DataFolderFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async getPath (folder: DataFolder) {
    return await this.raw.getPath(folder)
  }

  async mayView (folder: DataFolder) {
    if (await this.haveDataFolderPerm(folder, 'view')) return true
    const dataEntries = await this.svc(DataServiceInternal).findByFolderInternalId(folder.internalId)
    for (const d of dataEntries) {
      if (await this.haveDataPerm(d, 'view')) return true
    }
    return false
  }

  async mayCreate (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'create')
  }

  async mayUpdate (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'update')
  }

  async mayDelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'delete')
  }

  async mayUndelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'undelete')
  }
}
