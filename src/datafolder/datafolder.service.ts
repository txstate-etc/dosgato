import { BaseService } from '@txstate-mws/graphql-server'
import { PrimaryKeyLoader, OneToManyLoader } from 'dataloader-factory'
import {
  DataFolder, DataFolderFilter, DosGatoService, getDataFolders, DataService,
  DataServiceInternal, CreateDataFolderInput, createDataFolder, DataFolderResponse,
  renameDataFolder, deleteDataFolder, undeleteDataFolder, TemplateService, TemplateType,
  SiteService
} from 'internal'

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
    filter = await this.processFilters(filter)
    return await this.loaders.get(dataFoldersBySiteIdLoader, filter).load(siteId)
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

  async create (args: CreateDataFolderInput) {
    const template = await this.svc(TemplateService).findByKey(args.templateKey)
    if (!template) throw new Error(`Template with key ${args.templateKey} not found.`)
    if (template.type !== TemplateType.DATA) throw new Error(`Template with key ${args.templateKey} is not a data template.`)
    if (args.siteId) {
      const site = await this.svc(SiteService).findById(args.siteId)
      if (!site) throw new Error('Cannot create data folder. Site does not exist.')
    }
    const folder = new DataFolder({ id: 0, guid: 0, name: args.name, templateId: template.id, siteId: args.siteId })
    if (!await this.haveDataFolderPerm(folder, 'create')) {
      throw new Error(`Current user is not permitted to create ${args.siteId ? 'datafolders in this site.' : 'global data folders.'}`)
    }
    try {
      const datafolder = await createDataFolder(args.name, template.id, args.siteId)
      this.loaders.clear()
      return new DataFolderResponse({ dataFolder: datafolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not create data folder')
    }
  }

  async rename (folderId: string, name: string) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Cannot rename a data folder that does not exist.')
    if (!(await this.haveDataFolderPerm(folder, 'update'))) throw new Error(`Current user is not permitted to rename folder ${String(folder.name)}.`)
    try {
      await renameDataFolder(folder.id, name)
      this.loaders.clear()
      const updatedFolder = await this.raw.findById(folderId)
      return new DataFolderResponse({ dataFolder: updatedFolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not rename data folder')
    }
  }

  async delete (folderId: string) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be deleted does not exist')
    if (!(await this.haveDataFolderPerm(folder, 'delete'))) throw new Error(`Current user is not permitted to delete data folder ${String(folder.name)}.`)
    const currentUser = await this.currentUser()
    try {
      await deleteDataFolder(folder.id, currentUser!.internalId)
      this.loaders.clear()
      const deletedfolder = await this.raw.findById(folderId)
      return new DataFolderResponse({ dataFolder: deletedfolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not delete data folder')
    }
  }

  async undelete (folderId: string) {
    const folder = await this.raw.findById(folderId)
    if (!folder) throw new Error('Folder to be restored does not exist')
    if (!(await this.haveDataFolderPerm(folder, 'undelete'))) throw new Error(`Current user is not permitted to restore data folder ${String(folder.name)}.`)
    try {
      await undeleteDataFolder(folder.id)
      this.loaders.clear()
      const restoredfolder = await this.raw.findById(folderId)
      return new DataFolderResponse({ dataFolder: restoredfolder, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('Could not restore data folder')
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

  async mayDelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'delete')
  }

  async mayUndelete (folder: DataFolder) {
    return await this.haveDataFolderPerm(folder, 'undelete')
  }
}
