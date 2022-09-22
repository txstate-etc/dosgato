/* eslint-disable no-trailing-spaces */
import { BaseService, ValidatedResponse, MutationMessageType, Context } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique, isNotNull, someAsync, eachConcurrent, mapConcurrent, intersect, isNull } from 'txstate-utils'
import {
  Data, DataFilter, getData, VersionedService, appendPath, DosGatoService,
  DataFolderServiceInternal, DataFolderService, CreateDataInput, SiteServiceInternal,
  createDataEntry, DataResponse, DataMultResponse, templateRegistry, UpdateDataInput, getDataIndexes,
  renameDataEntry, deleteDataEntries, undeleteDataEntries, MoveDataTarget, moveDataEntries,
  DataFolder, Site, TemplateService, DataRoot, migrateData, DataRootService
} from '../internal.js'

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

const dataByTemplateLoader = new OneToManyLoader({
  fetch: async (templateKeys: string[], filter: DataFilter|undefined, ctx: Context) => {
    const idToTemplateKey = new Map<string, string>()
    await Promise.all(templateKeys.map(async key => {
      const searchRule = { indexName: 'templateKey', equal: key }
      const dataIds = await ctx.svc(VersionedService).find([searchRule], 'latest')
      for (const dataId of dataIds) idToTemplateKey.set(dataId, key)
    }))
    const data = await getData({ ...filter, ids: intersect({ skipEmpty: true }, filter?.ids, Array.from(idToTemplateKey.keys())) })
    for (const item of data) (item as any).templateKey = idToTemplateKey.get(item.dataId)
    return data
  },
  extractKey: (item: any) => item.templateKey
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
    filter = await this.processFilters(filter)
    return await this.loaders.get(dataByFolderInternalIdLoader, filter).load(folderId)
  }

  async findById (dataId: string) {
    return await this.loaders.get(dataByIdLoader).load(dataId)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(dataByIdLoader, ids)
  }

  async findBySiteId (siteId: string, filter?: DataFilter) {
    filter = await this.processFilters(filter)
    // If we were looking for data entries with particular template keys and processFilters did not
    // find any, then there are no entries that match the filters
    if (filter?.templateKeys && !filter?.ids?.length) {
      return []
    }
    return await this.loaders.get(dataBySiteIdLoader, filter).load(siteId)
  }

  async findByTemplate (key: string, filter?: DataFilter) {
    return await this.loaders.get(dataByTemplateLoader, filter).load(key)
  }

  async findByDataRoot (dataroot: DataRoot, filter?: DataFilter) {
    if (dataroot.site) return await this.findBySiteId(dataroot.site.id, { ...filter, templateKeys: [dataroot.template.key] })
    else return await this.loaders.get(dataByTemplateLoader, { ...filter, global: true }).load(dataroot.template.key)
  }

  async getPath (data: Data) {
    if (!data.folderInternalId) return '/'
    const folder = await this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId)
    const folderPath = await this.svc(DataFolderServiceInternal).getPath(folder!)
    return appendPath(folderPath, data.name as string)
  }

  async processFilters (filter?: DataFilter) {
    if (filter?.templateKeys?.length) {
      const searchRule = { indexName: 'templateKey', in: filter.templateKeys }
      const dataIds = await this.svc(VersionedService).find([searchRule], 'latest')
      filter.ids = intersect({ skipEmpty: true }, dataIds, filter.ids)
    }
    return filter ?? {} as DataFilter
  }
}

export class DataService extends DosGatoService<Data> {
  raw = this.svc(DataServiceInternal)

  async find (filter: DataFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findByIds (ids: string[]) {
    return await this.removeUnauthorized(await this.raw.findByIds(ids))
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

  async findByDataRoot (dataroot: DataRoot, filter?: DataFilter) {
    return await this.removeUnauthorized(await this.raw.findByDataRoot(dataroot, filter))
  }

  async getPath (data: Data) {
    return await this.raw.getPath(data)
  }

  async create (args: CreateDataInput, validateOnly?: boolean) {
    let site: Site|undefined
    let dataroot: DataRoot
    const template = await this.svc(TemplateService).findByKey(args.data.templateKey)
    if (!template) throw new Error('Tried to create data with an unrecognized template.')
    const response = new DataResponse({ success: true })
    if (args.folderId) {
      const folder = await this.svc(DataFolderServiceInternal).findById(args.folderId)
      if (!folder) throw new Error('Data cannot be created in a data folder that does not exist.')
      if (!(await this.svc(DataFolderService).mayCreate(folder))) throw new Error(`Current user is not permitted to create data in folder ${String(folder.name)}`)
      if (folder.templateId !== template.id) {
        throw new Error('Data cannot be created in a folder using a different data template.')
      }
      site = folder.siteId ? await this.svc(SiteServiceInternal).findById(folder.siteId) : undefined
      dataroot = new DataRoot(site, template)
      const otherData = await this.raw.findByFolderInternalId(folder.internalId)
      if (otherData.some(d => d.name === args.name)) {
        response.addMessage('A data entry with this name already exists', 'args.name')
      }
    } else if (args.siteId) {
      site = await this.svc(SiteServiceInternal).findById(args.siteId)
      if (!site) throw new Error('Data cannot be created in a site that does not exist.')
      dataroot = new DataRoot(site, template)
      if (!await this.svc(DataRootService).mayCreate(dataroot)) throw new Error(`Current user is not permitted to create data in site ${String(site.name)}.`)
      const dataEntries = await (await this.raw.findByDataRoot(dataroot)).filter(d => isNull(d.folderInternalId))
      if (dataEntries.some(d => d.name === args.name)) {
        response.addMessage('A data entry with this name already exists', 'args.name')
      }
    } else {
      // global data
      if (!(await this.mayCreateGlobal())) throw new Error('Current user is not permitted to create global data entries.')
      dataroot = new DataRoot(undefined, template)
      const dataEntries = await (await this.raw.findByDataRoot(dataroot)).filter(d => isNull(d.folderInternalId) && isNull(d.siteId))
      if (dataEntries.some(d => d.name === args.name)) {
        response.addMessage('A data entry with this name already exists', 'args.name')
      }
    }
    // validate data
    const tmpl = templateRegistry.getDataTemplate(template.key)
    const migrated = await migrateData(this.ctx, args.data, dataroot.id, args.folderId)
    const messages = await tmpl.validate?.(migrated, { query: this.ctx.query, dataRootId: dataroot.id, dataFolderId: args.folderId }) ?? []
    for (const message of messages) {
      response.addMessage(message.message, `args.data.${message.path}`, message.type as MutationMessageType)
    }
    if (validateOnly || response.hasErrors()) return response
    // passed validation, save it
    const versionedService = this.svc(VersionedService)
    const data = await createDataEntry(versionedService, this.login, args)
    response.success = true
    response.data = data
    return response
  }

  async update (dataId: string, args: UpdateDataInput, validateOnly?: boolean) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be updated does not exist')
    if (!(await this.mayUpdate(data))) throw new Error('Current user is not permitted to update this data entry.')
    const tmpl = templateRegistry.getDataTemplate(args.data.templateKey)
    const dataRootId = `${data.siteId ?? 'global'}-${args.data.templateKey}`
    const folder = data.folderInternalId ? await this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId) : undefined
    const migrated = await migrateData(this.ctx, args.data, dataRootId, folder?.id, data.id)
    const messages = await tmpl.validate?.(migrated, { query: this.ctx.query, dataRootId, dataFolderId: folder?.id, dataId: data.id }) ?? []
    const response = new DataResponse({ success: true })
    for (const message of messages) {
      response.addMessage(message.message, `args.data.${message.path}`, message.type as MutationMessageType)
    }
    if (validateOnly || response.hasErrors()) return response
    const indexes = getDataIndexes(migrated)
    await this.svc(VersionedService).update(dataId, args.data, indexes, { user: this.login, comment: args.comment, version: args.dataVersion })
    this.loaders.clear()
    const updated = await this.raw.findById(dataId)
    response.success = true
    response.data = updated
    return response
  }

  async rename (dataId: string, name: string, validateOnly?: boolean) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be renamed does not exist')
    if (!(await this.mayUpdate(data))) throw new Error('Current user is not permitted to rename this data entry.')
    const response = new DataResponse({ success: true })
    if (name !== data.name) {
      if (data.folderInternalId) {
        const sameNameEntryInFolder = (await this.raw.findByFolderInternalId(data.folderInternalId)).find(d => d.name === name)
        if (isNotNull(sameNameEntryInFolder)) {
          response.addMessage('A data entry with this name already exists', 'name')
        }
      } else if (data.siteId) {
        const sameNameEntryInSite = (await this.raw.findBySiteId(data.siteId)).filter(d => isNull(d.folderInternalId) && d.name === name)
        if (sameNameEntryInSite.length) {
          response.addMessage('A data entry with this name already exists', 'name')
        }
      } else {
        // check the global entries that are not in a folder
        const sameNameGlobal = (await this.raw.find({ global: true })).filter(d => isNull(d.folderInternalId) && d.name === name)
        if (sameNameGlobal.length) {
          response.addMessage('A data entry with this name already exists', 'name')
        }
      }
    }
    if (validateOnly || response.hasErrors()) return response
    await renameDataEntry(dataId, name)
    this.loaders.clear()
    response.data = await this.raw.findById(dataId)
    return response
  }

  async move (dataIds: string[], target: MoveDataTarget) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(data, async (d: Data) => !(await this.mayMove(d)))) {
      throw new Error('Current user is not permitted to move one or more data entries')
    }
    const templateKeys = await mapConcurrent((data.map(d => d.dataId)), async (dataId) => {
      const versioned = await this.svc(VersionedService).get(dataId)
      const indexes = await this.svc(VersionedService).getIndexes(dataId, versioned!.version)
      const templateKeyIndex = indexes.find(i => i.name === 'templateKey')
      return templateKeyIndex!.values[0]
    })
    if (unique(templateKeys).length > 1) {
      throw new Error('Data entries being moved must all have the same template')
    }
    const template = await this.svc(TemplateService).findByKey(templateKeys[0])
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
      await moveDataEntries(versionedService, data.map(d => d.dataId), templateKeys[0], target)
      this.loaders.clear()
      const updated = await this.raw.findByIds(data.map(d => d.dataId))
      return new DataMultResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to move one or more data entries')
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

  async delete (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(data, async (d: Data) => !(await this.mayDelete(d)))) {
      throw new Error('Current user is not permitted to delete one or more data entries')
    }
    const currentUser = await this.currentUser()
    try {
      await deleteDataEntries(data.map(d => d.dataId), currentUser!.internalId)
      this.loaders.clear()
      const updated = await this.raw.findByIds(data.map(d => d.dataId))
      return new DataMultResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to delete one or more data entries')
    }
  }

  async undelete (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(data, async (d: Data) => !(await this.mayUndelete(d)))) {
      throw new Error('Current user is not permitted to restore one or more data entries')
    }
    try {
      await undeleteDataEntries(data.map(d => d.dataId))
      this.loaders.clear()
      const restored = await this.raw.findByIds(data.map(d => d.dataId))
      return new DataMultResponse({ success: true, data: restored })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to restore one or more data entries')
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
