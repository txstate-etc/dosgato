import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader, OneToManyLoader } from 'dataloader-factory'
import { intersect, isNotBlank, isNotNull, keyby, someAsync } from 'txstate-utils'
import {
  DataFolder, DataFolderFilter, DosGatoService, getDataFolders,
  DataServiceInternal, CreateDataFolderInput, createDataFolder, DataFolderResponse,
  renameDataFolder, deleteDataFolder, undeleteDataFolders, TemplateService, TemplateType,
  SiteService, DataFoldersResponse, moveDataFolders, DataRoot, DataRootService,
  folderNameUniqueInDataRoot, TemplateServiceInternal, VersionedService, SiteServiceInternal, DeleteStateAll, finalizeDataFolderDeletion
} from '../internal.js'

const dataFoldersByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getDataFolders({ ids, deleteStates: DeleteStateAll })
  },
  extractId: (item: DataFolder) => item.id
})

const dataFoldersByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => {
    return await getDataFolders({ internalIds, deleteStates: DeleteStateAll })
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
    if (!folder.siteId) {
      return '/global/' + (folder.name as string)
    } else {
      const site = await this.svc(SiteServiceInternal).findById(folder.siteId)
      return `/${site!.name}/` + (folder.name as string)
    }
  }

  async processFilters (filter?: DataFolderFilter) {
    if (filter?.paths) {
      const siteNames = filter.paths.map(p => p.split('/').filter(isNotBlank)[0]).filter(name => name !== 'global')
      const sites = await this.svc(SiteServiceInternal).find({ names: siteNames })
      const sitesByName = keyby(sites, 'name')
      const promises: Promise<DataFolder[]>[] = []
      for (const path of filter.paths) {
        const parts = path.split('/').filter(isNotBlank)
        if (parts.length === 2) {
          if (parts[0] === 'global') {
            promises.push(this.find({ global: true, names: [parts[1]] }))
          } else {
            if (sitesByName[parts[0]]) {
              promises.push(this.find({ names: [parts[1]], siteIds: [sitesByName[parts[0]].id] }))
            }
          }
        } else if (parts.length === 1) {
          if (parts[0] === 'global') {
            promises.push(this.find({ global: true }))
          } else {
            if (sitesByName[parts[0]]) {
              promises.push(this.find({ siteIds: [sitesByName[parts[0]].id] }))
            }
          }
        }
      }
      const folders = (await Promise.all(promises)).flat()
      if (!folders.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, folders.map(f => f.internalId))
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
    if (!(await folderNameUniqueInDataRoot(args.name as string, template.id, args.siteId))) {
      response.addMessage(`A folder with this name already exists in ${args.siteId ? 'this site' : 'global data'}.`, 'args.name')
    }
    if (validateOnly || response.hasErrors()) return response
    const dataFolder = await createDataFolder(args.name as string, template.id, args.siteId)
    this.loaders.clear()
    response.dataFolder = dataFolder
    return response
  }

  async rename (folderId: string, name: string, validateOnly?: boolean) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Cannot rename a data folder that does not exist.')
    if (!(await this.haveDataFolderPerm(folder, 'update'))) throw new Error(`Current user is not permitted to rename folder ${String(folder.name)}.`)
    const response = new DataFolderResponse({ success: true })
    if (name !== folder.name && !(await folderNameUniqueInDataRoot(name, folder.templateId, folder.siteId))) {
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
    const dataFolders = await this.raw.findByIds(folderIds)
    if (!dataFolders.length) throw new Error('Folders to be deleted do not exist.')
    if (await someAsync(dataFolders, async (d: DataFolder) => !(await this.mayDelete(d)))) {
      throw new Error('Current user is not permitted to delete one or more data folders.')
    }
    const currentUser = await this.currentUser()
    await deleteDataFolder(this.svc(VersionedService), dataFolders.map(f => f.id), currentUser!.internalId)
    this.loaders.clear()
    const deletedFolders = await this.raw.findByIds(dataFolders.map(f => f.id))
    return new DataFoldersResponse({ dataFolders: deletedFolders, success: true })
  }

  async finalizeDeletion (folderIds: string[]) {
    const folders = await this.raw.findByIds(folderIds)
    if (!folders.length) throw new Error('Folders to be deleted do not exist.')
    if (await someAsync(folders, async (d: DataFolder) => !(await this.mayDelete(d)))) {
      throw new Error('Current user is not permitted to delete one or more data folders.')
    }
    const currentUser = await this.currentUser()
    await finalizeDataFolderDeletion(folderIds, currentUser!.internalId)
    this.loaders.clear()
    const deletedfolders = await this.raw.findByIds(folderIds)
    return new DataFoldersResponse({ dataFolders: deletedfolders, success: true })
  }

  async undelete (folderIds: string[]) {
    const dataFolders = await this.raw.findByIds(folderIds)
    if (!dataFolders.length) throw new Error('Folders to be restored do not exist.')
    if (await someAsync(dataFolders, async (d: DataFolder) => !(await this.mayUndelete(d)))) {
      throw new Error('Current user is not permitted to restore one or more data folders.')
    }
    await undeleteDataFolders(dataFolders.map(f => f.id))
    this.loaders.clear()
    const restoredFolders = await this.raw.findByIds(dataFolders.map(f => f.id))
    return new DataFoldersResponse({ dataFolders: restoredFolders, success: true })
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
