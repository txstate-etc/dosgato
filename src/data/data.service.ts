/* eslint-disable no-trailing-spaces */
import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique, isNotNull, someAsync, eachConcurrent } from 'txstate-utils'
import {
  Data, DataFilter, getData, VersionedService, appendPath, DosGatoService,
  DataFolderServiceInternal, DataFolderService, CreateDataInput, SiteServiceInternal,
  createDataEntry, DataResponse, templateRegistry, UpdateDataInput, getDataIndexes,
  renameDataEntry, deleteDataEntry, undeleteDataEntry, MoveDataTarget, moveDataEntry,
  DataFolder, Site, TemplateService
} from 'internal'

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
    if (filter?.templateKeys) {
      filter = await this.processFilters(filter)
    }
    return await this.loaders.get(dataByFolderInternalIdLoader, filter).load(folderId)
  }

  async findById (dataId: string) {
    return await this.loaders.get(dataByIdLoader).load(dataId)
  }

  async findBySiteId (siteId: string, filter?: DataFilter) {
    if (filter?.templateKeys) {
      filter = await this.processFilters(filter)
    }
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

  async create (args: CreateDataInput) {
    const response = new DataResponse({})
    if (args.folderId) {
      const folder = await this.svc(DataFolderServiceInternal).findById(args.folderId)
      if (!folder) throw new Error('Data cannot be created in a data folder that does not exist.')
      if (!(await this.svc(DataFolderService).mayCreate(folder))) throw new Error(`Current user is not permitted to create data in folder ${String(folder.name)}`)
      const template = await this.svc(TemplateService).findByKey(args.templateKey)
      if (folder.templateId !== template!.id) {
        throw new Error('Data cannot be created in a folder using a different data template.')
      }
    } else if (args.siteId) {
      const site = await this.svc(SiteServiceInternal).findById(args.siteId)
      if (!site) throw new Error('Data cannot be created in a site that does not exist.')
      // TODO: Does the current user have permission to create data for the site?
      const data = new Data({ id: 0, siteId: args.siteId })
      if (!(await this.haveDataPerm(data, 'create'))) throw new Error(`Current user is not permitted to create data in site ${String(site.name)}.`)
    } else {
      // global data
      if (!(await this.mayCreateGlobal())) throw new Error('Current user is not permitted to create global data entries.')
    }
    try {
      // validate data
      const validator = templateRegistry.get(args.templateKey).validate
      const messages = await validator(args.data)
      if (Object.keys(messages).length) {
        for (const key of Object.keys(messages)) {
          // TODO: Not sure about this. The validator can return an array of message for each field, but MutationMessage has one
          // message per field.
          for (const message of messages[key]) {
            response.addMessage(message, key, MutationMessageType.error)
          }
        }
        return response
      }
      // passed validation, save it
      const versionedService = this.svc(VersionedService)
      const data = await createDataEntry(versionedService, this.login, args)
      response.success = true
      response.data = data
      return response
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to create data entry')
    }
  }

  async update (dataId: string, args: UpdateDataInput) {
    const response = new DataResponse({})
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be updated does not exist')
    if (!(await this.mayUpdate(data))) throw new Error('Current user is not permitted to update this data entry.')
    try {
      const validator = templateRegistry.get(args.data.templateKey).validate
      const messages = await validator(args.data)
      if (Object.keys(messages).length) {
        for (const key of Object.keys(messages)) {
          for (const message of messages[key]) {
            response.addMessage(message, key, MutationMessageType.error)
          }
        }
        return response
      }
      const indexes = getDataIndexes(args.data)
      await this.svc(VersionedService).update(dataId, args.data, indexes, { user: this.login, comment: args.comment, version: args.dataVersion })
      this.loaders.clear()
      const updated = await this.raw.findById(dataId)
      response.success = true
      response.data = updated
      return response
    } catch (err: any) {
      console.error(err)
      throw new Error(`Unable to update data entry ${String(data.name)}`)
    }
  }

  async rename (dataId: string, name: string) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be renamed does not exist')
    if (!(await this.mayUpdate(data))) throw new Error('Current user is not permitted to rename this data entry.')
    try {
      await renameDataEntry(dataId, name)
      this.loaders.clear()
      const updated = await this.raw.findById(dataId)
      return new DataResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error(`Unable to rename data entry ${String(data.name)}`)
    }
  }

  async move (dataId: string, target: MoveDataTarget) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be moved does not exist')
    if (!(await this.mayMove(data))) throw new Error('Current user is not permitted to move this data entry.')
    // get the template for the data being moved
    const versioned = await this.svc(VersionedService).get(dataId)
    const indexes = await this.svc(VersionedService).getIndexes(dataId, versioned!.version)
    const templateKeyIndex = indexes.find(i => i.name === 'template')
    const templateKey = templateKeyIndex!.values[0]
    const template = await this.svc(TemplateService).findByKey(templateKey)
    let folder: DataFolder|undefined
    if (target.folderId) {
      folder = await this.svc(DataFolderServiceInternal).findById(target.folderId)
      if (!folder) throw new Error('Data cannot be moved to a data folder that does not exist.')
      if (!(await this.svc(DataFolderService).mayCreate(folder))) throw new Error(`Current user is not permitted to move data to folder ${String(folder.name)}`)
      if (folder.templateId !== template!.id) throw new Error('Data can only be moved to a folder using the same template.')
    }
    let site: Site|undefined
    if (target.siteId) {
      site = await this.svc(SiteServiceInternal).findById(target.siteId)
      if (!site) throw new Error('Data cannot be moved to a site that does not exist.')
      // TODO: Does the current user have permission to move data to this site?
      const tempdata = new Data({ id: 0, siteId: target.siteId })
      if (!(await this.haveDataPerm(tempdata, 'move'))) throw new Error(`Current user is not permitted to move data to site ${String(site.name)}.`)
    }
    let aboveTarget: Data|undefined
    if (target.aboveTarget) {
      aboveTarget = await this.raw.findById(target.aboveTarget)
      if (!aboveTarget) throw new Error('Data entry cannont be moved above a data entry that does not exist')
    }
    // if none of these are provided, they are moving the data to global data
    if (!target.folderId && !target.siteId && !target.aboveTarget && !(await this.mayCreateGlobal())) throw new Error('Current user is not permitted to update global data entries.')
    try {
      const versionedService = this.svc(VersionedService)
      await moveDataEntry(versionedService, dataId, templateKey, target)
      this.loaders.clear()
      const updated = await this.raw.findById(dataId)
      return new DataResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error(`Unable to move data entry ${String(data.name)}`)
    }
  }

  async publish (dataIds: string[]) {
    let data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(data, async (d: Data) => !(await this.mayPublish(d)))) {
      throw new Error('Current user is not permitted to publish one or more data entries')
    }
    data = data.filter(d => !d.deleted)
    try {
      await eachConcurrent(data.map(d => d.dataId), async (dataId) => await this.svc(VersionedService).tag(dataId, 'published', undefined, this.login))
      this.loaders.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to publish one or more data entries.')
    }
  }

  async unpublish (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(data, async (d: Data) => !(await this.mayUnpublish(d)))) {
      throw new Error('Current user is not permitted to unpublish one or more data entries')
    }
    try {
      await eachConcurrent(data.map(d => d.dataId), async (dataId) => await this.svc(VersionedService).removeTag(dataId, 'published'))
      this.loaders.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to unpublish one or more data entries')
    }
  }

  async delete (dataId: string) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be deleted does not exist.')
    if (!(await this.mayDelete(data))) throw new Error('Current user is not permitted to delete this data entry')
    const currentUser = await this.currentUser()
    try {
      await deleteDataEntry(dataId, currentUser!.internalId)
      this.loaders.clear()
      const updated = await this.raw.findById(dataId)
      return new DataResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error(`Unable to delete data entry ${String(data.name)}`)
    }
  }

  async undelete (dataId: string) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Cannot restore a data entry that does not exist.')
    if (!(await this.mayUndelete(data))) throw new Error('Current user is not permitted to restore this data entry')
    try {
      await undeleteDataEntry(dataId)
      this.loaders.clear()
      const restored = await this.raw.findById(dataId)
      return new DataResponse({ success: true, data: restored })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to restore data entry')
    }
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
