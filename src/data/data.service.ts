import { BaseService } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique } from 'txstate-utils'
import { Data, DataFilter, getData, VersionedService, appendPath, DosGatoService, DataFolderServiceInternal } from 'internal'

const dataByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => await getData({ internalIds }),
  extractId: item => item.internalId
})

const dataByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getData({ ids }),
  idLoader: dataByInternalIdLoader
})
dataByInternalIdLoader.addIdLoader(dataByIdLoader)

const dataByFolderInternalIdLoader = new OneToManyLoader({
  fetch: async (folderInternalIds: number[], filter?: DataFilter) => {
    return await getData({ ...filter, folderInternalIds })
  },
  extractKey: (item: Data) => item.folderInternalId!,
  keysFromFilter: (filter: DataFilter | undefined) => filter?.folderInternalIds ?? [],
  idLoader: [dataByInternalIdLoader, dataByIdLoader]
})

const dataBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[], filter?: DataFilter) => {
    return await getData({ ...filter, siteIds })
  },
  extractKey: (item: Data) => item.siteId!,
  keysFromFilter: (filter: DataFilter | undefined) => filter?.siteIds ?? [],
  idLoader: [dataByInternalIdLoader, dataByIdLoader]
})

export class DataServiceInternal extends BaseService {
  async find (filter: DataFilter) {
    filter = await this.processFilters(filter)
    const data = await getData(filter)
    for (const item of data) {
      this.loaders.get(dataByIdLoader).prime(item.id, item)
      this.loaders.get(dataByInternalIdLoader).prime(item.internalId, item)
    }
    return data
  }

  async findByFolderInternalId (folderId: number, filter?: DataFilter) {
    return await this.loaders.get(dataByFolderInternalIdLoader, filter).load(folderId)
  }

  async findBySiteId (siteId: string, filter?: DataFilter) {
    return await this.loaders.get(dataBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplate (key: string, filter?: DataFilter) {
    const searchRule = { indexName: 'template', equal: key }
    const [dataIdsLatest, dataIdsPublished] = await Promise.all([
      this.svc(VersionedService).find([searchRule], 'latest'),
      this.svc(VersionedService).find([searchRule], 'published')])
    let dataIds = unique([...dataIdsLatest, ...dataIdsPublished])
    if (!dataIds.length) return []
    if (filter?.ids?.length) {
      dataIds = dataIds.filter(i => filter.ids?.includes(i))
    }
    return await this.find({ ids: dataIds })
  }

  async getPath (data: Data) {
    if (!data.folderInternalId) return '/'
    const folder = await this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId)
    const folderPath = await this.svc(DataFolderServiceInternal).getPath(folder!)
    return appendPath(folderPath, data.name as string)
  }

  protected async processFilters (filter: DataFilter) {
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

export class DataService extends DosGatoService<Data> {
  raw = this.svc(DataServiceInternal)

  async find (filter: DataFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findByFolderInternalId (folderId: number, filter?: DataFilter) {
    return await this.removeUnauthorized(await this.raw.findByFolderInternalId(folderId, filter))
  }

  async findBySiteId (siteId: string, filter?: DataFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByTemplate (key: string, filter?: DataFilter) {
    return await this.removeUnauthorized(await this.raw.findByTemplate(key, filter))
  }

  async getPath (data: Data) {
    return await this.raw.getPath(data)
  }

  async mayView (data: Data) {
    return await this.haveDataPerm(data, 'view')
  }

  async mayViewManagerUI () {
    return await this.haveGlobalPerm('manageGlobalData') || (await this.currentDataRules()).some(r => r.grants.viewForEdit)
  }

  async mayViewForEdit (data: Data) {
    return await this.haveDataPerm(data, 'viewForEdit')
  }

  async mayUpdate (data: Data) {
    return await this.haveDataPerm(data, 'update')
  }

  async mayMove (data: Data) {
    return await this.haveDataPerm(data, 'move')
  }

  async mayPublish (data: Data) {
    return await this.haveDataPerm(data, 'publish')
  }

  async mayUnpublish (data: Data) {
    return await this.haveDataPerm(data, 'unpublish')
  }

  async mayDelete (data: Data) {
    return await this.haveDataPerm(data, 'delete')
  }

  async mayUndelete (data: Data) {
    return await this.haveDataPerm(data, 'undelete')
  }

  async mayCreateGlobal () {
    return await this.haveGlobalPerm('manageGlobalData')
  }
}
