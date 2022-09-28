import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader, OneToManyLoader } from 'dataloader-factory'
import { isNotNull, someAsync } from 'txstate-utils'
import {
  DataFolder, DataFolderFilter, DosGatoService, getDataFolders,
  DataServiceInternal, CreateDataFolderInput, createDataFolder, DataFolderResponse,
  renameDataFolder, deleteDataFolder, undeleteDataFolders, TemplateService, TemplateType,
  SiteService, DataFoldersResponse, moveDataFolders, DeletedFilter, DataRoot, DataRootService,
  folderNameUniqueInDataRoot,
  TemplateServiceInternal
} from '../internal.js'

const dataFoldersByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getDataFolders({ ids, deleted: DeletedFilter.SHOW })
  },
  extractId: (item: DataFolder) => item.id
})

const dataFoldersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getDataFolders({ internalIds, deleted: DeletedFilter.SHOW })
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
  keysFromFilter: (filter: DataFolderFilter | undefined) => filter?.siteIds ?? [],
  idLoader: dataFoldersByIdLoader
})

const globalDataFoldersByTemplateIds = new OneToManyLoader({
  fetch: async (templateIds: number[], filter?: DataFolderFilter) => await getDataFolders({ ...filter, templateIds, global: true }),
  extractKey: f => f.templateId,
  keysFromFilter: (filter?: DataFolderFilter) => filter?.templateIds ?? [],
  idLoader: dataFoldersByIdLoader
})

export class DataFolderServiceInternal extends BaseService {
  async find (filter?: DataFolderFilter) {
    filter = await this.processFilters(filter)
    return await getDataFolders(filter)
  }

  async findById (id: string) {
    return await this.loaders.get(dataFoldersByIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(dataFoldersByIdLoader, ids)
  }

  async findByInternalId (internalId: number) {
    return await this.loaders.get(dataFoldersByInternalIdLoader).load(internalId)
  }

  async findBySiteId (siteId: string, filter?: DataFolderFilter) {
    filter = await this.processFilters(filter)
    return await this.loaders.get(dataFoldersBySiteIdLoader, filter).load(siteId)
  }

  async findByDataRoot (dataroot: DataRoot, filter?: DataFolderFilter) {
    if (dataroot.site) return await this.findBySiteId(dataroot.site.id, { ...filter, templateIds: [dataroot.template.id] })
    else return await this.loaders.get(globalDataFoldersByTemplateIds, filter).load(dataroot.template.id)
  }

  async getPath (folder: DataFolder) {
    return '/' + (folder.name as string)
  }

  async processFilters (filter?: DataFolderFilter) {
    if (filter?.templateKeys) {
      const templates = await this.svc(TemplateService).findByKeys(filter.templateKeys)
      const ids = templates.map(t => t.id)
      if (filter.templateIds) {
        filter.templateIds.push(...ids)
      } else filter.templateIds = ids
    }
    return filter
  }
}

export class DataFolderService extends DosGatoService<DataFolder> {
  raw = this.svc(DataFolderServiceInternal)

  async find (filter?: DataFolderFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByInternalId (internalId: number) {
    return await this.removeUnauthorized(await this.raw.findByInternalId(internalId))
  }

  async findBySiteId (siteId: string, filter?: DataFolderFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByDataRoot (dataroot: DataRoot, filter?: DataFolderFilter) {
    return await this.removeUnauthorized(await this.raw.findByDataRoot(dataroot, filter))
  }

  async getPath (folder: DataFolder) {
    return await this.raw.getPath(folder)
  }

  async create (args: CreateDataFolderInput, validateOnly?: boolean) {
    const template = await this.svc(TemplateService).findByKey(args.templateKey)
    if (!template) throw new Error(`Template with key ${args.templateKey} not found.`)
    if (template.type !== TemplateType.DATA) throw new Error(`Template with key ${args.templateKey} is not a data template.`)
    if (args.siteId) {
      const site = await this.svc(SiteService).findById(args.siteId)
      if (!site) throw new Error('Cannot create data folder. Site does not exist.')
      const dataroots = await this.svc(DataRootService).findBySite(site, { templateKeys: [template.key] })
      if (!(await this.haveDataRootPerm(dataroots[0], 'create'))) throw new Error(`Current user is not permitted to create datafolders in ${site.name}.`)
    } else {
      if (!(await this.haveGlobalPerm('manageGlobalData'))) throw new Error('Current user is not permitted to create global data folders.')
    }
    const response = new DataFolderResponse({ success: true })
    if (!(await folderNameUniqueInDataRoot(args.name, args.siteId))) {
      response.addMessage(`A folder with this name already exists in ${args.siteId ? 'this site' : 'global data'}.`, 'args.name')
    }
    if (validateOnly || response.hasErrors()) return response
    const dataFolder = await createDataFolder(args.name, template.id, args.siteId)
    this.loaders.clear()
    response.dataFolder = dataFolder
    return response
  }

  async rename (folderId: string, name: string, validateOnly?: boolean) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Cannot rename a data folder that does not exist.')
    if (!(await this.haveDataFolderPerm(folder, 'update'))) throw new Error(`Current user is not permitted to rename folder ${String(folder.name)}.`)
    const response = new DataFolderResponse({ success: true })
    if (name !== folder.name && !(await folderNameUniqueInDataRoot(name, folder.siteId))) {
      response.addMessage(`A folder with this name already exists in ${folder.siteId ? 'this site' : 'global data'}.`, 'name')
    }
    if (validateOnly || response.hasErrors()) return response
    await renameDataFolder(folder.id, name)
    this.loaders.clear()
    response.dataFolder = await await this.raw.findById(folderId)
    return response
  }

  async move (folderIds: string[], siteId?: string) {
    const dataFolders = (await Promise.all(folderIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(dataFolders, async (d: DataFolder) => !(await this.mayMove(d)))) {
      throw new Error('Current user is not permitted to move one or more data folders')
    }
    if (siteId) {
      const site = await this.svc(SiteService).findById(siteId)
      if (!site) throw new Error('Data folders cannot be moved to a site that does not exist.')
      const template = await this.svc(TemplateServiceInternal).findById(dataFolders[0].templateId)
      const dataroot = new DataRoot(site, template!)
      if (!(await this.haveDataRootPerm(dataroot, 'create'))) {
        throw new Error('Current user is not permitted to move folders to this site.')
      }
    } else {
      if (!(await this.haveGlobalPerm('manageGlobalData'))) throw new Error('Current user is not permitted to add global data folders')
    }
    try {
      await moveDataFolders(dataFolders.map((f: DataFolder) => f.id), siteId)
      this.loaders.clear()
      const moved = await this.raw.findByIds(dataFolders.map(f => f.id))
      return new DataFoldersResponse({ dataFolders: moved, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to move one or more data folders')
    }
  }

  async delete (folderIds: string[]) {
    const dataFolders = (await Promise.all(folderIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(dataFolders, async (d: DataFolder) => !(await this.mayDelete(d)))) {
      throw new Error('Current user is not permitted to delete one or more data folders')
    }
    const currentUser = await this.currentUser()
    try {
      await deleteDataFolder(dataFolders.map(f => f.id), currentUser!.internalId)
      this.loaders.clear()
      const deletedFolders = await this.raw.findByIds(dataFolders.map(f => f.id))
      return new DataFoldersResponse({ dataFolders: deletedFolders, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to delete one or more data folders')
    }
  }

  async undelete (folderIds: string[]) {
    const dataFolders = (await Promise.all(folderIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (await someAsync(dataFolders, async (d: DataFolder) => !(await this.mayUndelete(d)))) {
      throw new Error('Current user is not permitted to restore one or more data folders')
    }
    try {
      await undeleteDataFolders(dataFolders.map(f => f.id))
      this.loaders.clear()
      const restoredFolders = await this.raw.findByIds(dataFolders.map(f => f.id))
      return new DataFoldersResponse({ dataFolders: restoredFolders, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to restore one or more data folders')
    }
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

  async mayMove (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'move')
  }

  async mayDelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'delete')
  }

  async mayUndelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'undelete')
  }
}
