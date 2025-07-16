/* eslint-disable no-trailing-spaces */
import { BaseService, ValidatedResponse, type MutationMessageType, type Context } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { isNotNull, intersect, isNull, keyby, isBlank } from 'txstate-utils'
import {
  type Data, type DataFilter, getData, VersionedService, appendPath, DosGatoService,
  DataFolderServiceInternal, DataFolderService, type CreateDataInput, SiteServiceInternal,
  createDataEntry, DataResponse, DataMultResponse, templateRegistry, type UpdateDataInput, getDataIndexes,
  renameDataEntry, deleteDataEntries, undeleteDataEntries, type MoveDataTarget, moveDataEntries,
  type DataFolder, type Site, TemplateService, DataRoot, migrateData, DataRootService, publishDataEntryDeletions,
  DeleteState, popPath, DeleteStateAll, DataRuleService, systemContext, makeSafe, numerateLoop
} from '../internal.js'
import db from 'mysql2-async/db'

const dataByInternalIdLoader = new PrimaryKeyLoader({
  fetch: async (internalIds: number[]) => await getData({ internalIds, deleteStates: DeleteStateAll }),
  extractId: item => item.internalId
})

const dataByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getData({ ids, deleteStates: DeleteStateAll }),
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
  fetch: async (templateKeys: string[], filter: DataFilter | undefined, ctx: Context) => {
    return await getData({ ...filter, templateKeys })
  },
  extractKey: (item: any) => item.templateKey
})

function safeComputedName (str: string | undefined) {
  if (isBlank(str)) return 'item-1'
  return makeSafe(str)
}

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
    if (!data.folderInternalId) {
      if (!data.siteId) return appendPath('/global', data.name)
      else {
        const site = await this.svc(SiteServiceInternal).findById(data.siteId)
        return appendPath(`/${site!.name}`, data.name)
      }
    }
    const folder = await this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId)
    const folderPath = await this.svc(DataFolderServiceInternal).getPath(folder!)
    return appendPath(folderPath, data.name)
  }

  async getData (data: Data, opts?: { version?: number, tag?: string }) {
    const versioned = await this.svc(VersionedService).get(data.intDataId, opts)
    return versioned?.data
  }

  async reindex (data: Data) {
    const dataData = await this.getData(data)
    await this.svc(VersionedService).setIndexes(data.intDataId, data.latestVersion, getDataIndexes(dataData))
    if (data.publishedVersion && data.publishedVersion !== data.latestVersion) {
      const publishedData = await this.getData(data, { version: data.publishedVersion })
      await this.svc(VersionedService).setIndexes(data.intDataId, data.publishedVersion, getDataIndexes(publishedData))
    }
  }

  async getTemplateKey (data: Data) {
    const content = await this.getData(data)
    return content.templateKey
  }

  async getConflictNames (folderInternalId: number | undefined, siteId: string | undefined, templateKey: string, currentName?: string) {
    const ret = new Set<string>()
    if (folderInternalId) {
      for (const d of await this.findByFolderInternalId(folderInternalId)) ret.add(d.name)
    } else if (siteId) {
      for (const d of await this.findBySiteId(siteId, { templateKeys: [templateKey] })) ret.add(d.name)
      for (const f of await this.svc(DataFolderServiceInternal).findBySiteId(siteId, { templateKeys: [templateKey] })) ret.add(f.name)
    } else {
      for (const d of (await this.findByTemplate(templateKey, { global: true })).filter(d => d.folderInternalId == null)) ret.add(d.name)
      for (const f of await this.svc(DataFolderServiceInternal).findByTemplateKey(templateKey, { global: true })) ret.add(f.name)
    }
    if (currentName) ret.delete(currentName)
    return ret
  }

  async processFilters (filter?: DataFilter) {
    if (filter?.links?.length) {
      const data = await this.findByIds(filter.links.map(l => l.id))
      const dataById = keyby(data, 'id')
      const notFoundById = filter.links.filter(l => !dataById[l.id])
      if (notFoundById.length) {
        const pathDataEntries = await this.find({ paths: notFoundById.map(l => l.path), templateKeys: notFoundById.map(l => l.templateKey) })
        const dataByPathAndTemplateKey: Record<string, Record<string, Data>> = {}
        await Promise.all(pathDataEntries.map(async d => {
          const path = await this.getPath(d)
          dataByPathAndTemplateKey[path] ??= {}
          dataByPathAndTemplateKey[path][d.templateKey] = d
        }))
        data.push(...notFoundById.map(link => dataByPathAndTemplateKey[link.path][link.templateKey]).filter(isNotNull))
      }
      if (!data.length) filter.internalIds = [-1]
      else filter.internalIds = intersect({ skipEmpty: true }, filter.internalIds, data.map(d => d.internalId))
    }
    return filter ?? {} as DataFilter
  }
}

export class DataService extends DosGatoService<Data> {
  raw = this.svc(DataServiceInternal)

  async find (filter: DataFilter) {
    const data = await this.raw.find(filter)
    if (filter?.links?.length || filter?.paths?.length || filter?.ids?.length) return data.filter(f => this.mayViewIndividual(f))
    return this.removeUnauthorized(data)
  }

  async findByIds (ids: string[]) {
    return this.removeUnauthorized(await this.raw.findByIds(ids))
  }

  async findByFolderInternalId (folderId: number, filter?: DataFilter) {
    return this.removeUnauthorized(await this.raw.findByFolderInternalId(folderId, filter))
  }

  async findBySiteId (siteId: string, filter?: DataFilter) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByTemplate (key: string, filter?: DataFilter) {
    return this.removeUnauthorized(await this.raw.findByTemplate(key, filter))
  }

  async findByDataRoot (dataroot: DataRoot, filter?: DataFilter) {
    return this.removeUnauthorized(await this.raw.findByDataRoot(dataroot, filter))
  }

  async getPath (data: Data) {
    return await this.raw.getPath(data)
  }

  getDataRootId (data: Data) {
    return `${data.siteId ?? 'global'}-${data.templateId}`
  }

  async getData (data: Data, opts?: { published?: boolean, version?: number, publishedIfNecessary?: boolean }) {
    opts ??= {}
    const mayViewLatest = this.mayViewLatest(data)
    opts.published = !!opts.published || (!mayViewLatest && opts.publishedIfNecessary)
    if (!opts.published && !mayViewLatest) throw new Error('You are only permitted to view the published version of this data.')
    const [versioned, folder] = await Promise.all([
      this.svc(VersionedService).get(data.intDataId, { version: opts.version, tag: opts.published ? 'published' : undefined }),
      data.folderInternalId ? this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId) : undefined
    ])
    if (!versioned && opts.published) throw new Error('Requested the published version of a piece of data that has never been published.')
    if (!versioned) return undefined
    const migrated = await migrateData(this.ctx, versioned.data, this.getDataRootId(data), folder?.id, data.id)
    return migrated
  }

  async create (args: CreateDataInput, validateOnly?: boolean) {
    let site: Site | undefined
    let dataroot: DataRoot
    const template = await this.svc(TemplateService).findByKey(args.data.templateKey)
    const tmpl = templateRegistry.getDataTemplate(args.data.templateKey)
    if (!tmpl || !template) throw new Error('Tried to create data with an unrecognized template.')
    const response = new DataResponse({ success: true })
    let siblings: (Data | DataFolder)[]
    if (args.folderId) {
      const folder = await this.svc(DataFolderServiceInternal).findById(args.folderId)
      if (!folder) throw new Error('Data cannot be created in a data folder that does not exist.')
      if (!this.svc(DataFolderService).mayCreate(folder)) throw new Error(`Current user is not permitted to create data in folder ${String(folder.name)}`)
      if (folder.templateId !== template.id) {
        throw new Error('Data cannot be created in a folder using a different data template.')
      }
      site = folder.siteId ? await this.svc(SiteServiceInternal).findById(folder.siteId) : undefined
      dataroot = new DataRoot(site, template)
      siblings = await this.raw.findByFolderInternalId(folder.internalId, { deleteStates: DeleteStateAll })
    } else if (args.siteId) {
      site = await this.svc(SiteServiceInternal).findById(args.siteId)
      if (!site) throw new Error('Data cannot be created in a site that does not exist.')
      dataroot = new DataRoot(site, template)
      if (!this.svc(DataRootService).mayCreate(dataroot)) throw new Error(`Current user is not permitted to create data in site ${String(site.name)}.`)
      siblings = [
        ...(await this.raw.findByDataRoot(dataroot, { deleteStates: DeleteStateAll })).filter(d => isNull(d.folderInternalId)),
        ...await this.svc(DataFolderServiceInternal).findBySiteId(args.siteId, { templateKeys: [template.key] })
      ]
    } else {
      // global data
      if (!(await this.mayCreateGlobal(template.id))) throw new Error('Current user is not permitted to create global data entries.')
      dataroot = new DataRoot(undefined, template)
      siblings = [
        ...(await this.raw.findByDataRoot(dataroot, { deleteStates: DeleteStateAll })).filter(d => isNull(d.folderInternalId) && isNull(d.siteId)),
        ...await this.svc(DataFolderServiceInternal).findByTemplateKey(template.key, { global: true })
      ]
    }
    // validate data
    const systemCtx = systemContext()
    const migrated = await migrateData(systemCtx, args.data, dataroot.id, args.folderId)
    const newName = safeComputedName(tmpl.computeName(migrated))
    const finalName = numerateLoop(newName, new Set(siblings.map(s => s.name)))
    const messages = await tmpl.validate?.(migrated, { query: systemCtx.query, dataRootId: dataroot.id, dataFolderId: args.folderId }, newName !== finalName) ?? []
    for (const message of messages) {
      response.addMessage(message.message, message.path && `args.data.${message.path}`, message.type as MutationMessageType)
    }
    if (validateOnly || response.hasErrors()) return response
    // passed validation, save it
    const versionedService = this.svc(VersionedService)
    const data = await createDataEntry(versionedService, this.login, finalName, { ...args, data: migrated })
    if (tmpl.nopublish) await versionedService.tag(data.intDataId, 'published', undefined, this.login)
    response.success = true
    response.data = data
    return response
  }

  async update (dataId: string, args: UpdateDataInput, validateOnly?: boolean) {
    const data = await this.raw.findById(dataId)
    if (!data) throw new Error('Data entry to be updated does not exist')
    if (!this.mayUpdate(data)) throw new Error('Current user is not permitted to update this data entry.')
    const tmpl = templateRegistry.getDataTemplate(args.data.templateKey)
    const dataRootId = `${data.siteId ?? 'global'}-${args.data.templateKey}`
    const folder = data.folderInternalId ? await this.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId) : undefined
    const systemCtx = systemContext()
    const migrated = await migrateData(systemCtx, args.data, dataRootId, folder?.id, data.id)
    const usedNames = await this.raw.getConflictNames(data.folderInternalId, data.siteId, data.templateKey, data.name)
    const newName = safeComputedName(tmpl.computeName(migrated))
    const finalName = numerateLoop(newName, usedNames)
    const messages = await tmpl.validate?.(migrated, { query: systemCtx.query, dataRootId, dataFolderId: folder?.id, dataId: data.id }, newName !== finalName) ?? []
    const response = new DataResponse({ success: true })
    for (const message of messages) {
      response.addMessage(message.message, message.path && `args.data.${message.path}`, message.type as MutationMessageType)
    }
    if (validateOnly || response.hasErrors()) return response
    const indexes = getDataIndexes(migrated)
    await renameDataEntry(dataId, finalName)
    await this.svc(VersionedService).update(data.intDataId, migrated, indexes, { user: this.login, comment: args.comment, version: args.dataVersion })
    if (tmpl.nopublish) await this.svc(VersionedService).tag(data.intDataId, 'published', undefined, this.login)
    this.loaders.clear()
    const updated = await this.raw.findById(dataId)
    response.success = true
    response.data = updated
    return response
  }

  async move (dataIds: string[], target: MoveDataTarget) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayMove(d))) {
      throw new Error('You are not permitted to move one or more data entries.')
    }

    const templateKeys = data.map(d => d.templateKey)
    if (new Set(templateKeys).size > 1) {
      throw new Error('Data entries being moved must all have the same template.')
    }
    const template = (await this.svc(TemplateService).findByKey(templateKeys[0]))!

    let folder: DataFolder | undefined
    let site: Site | undefined
    let aboveTarget: Data | undefined
    if (target.aboveTarget) {
      aboveTarget = await this.raw.findById(target.aboveTarget)
      if (!aboveTarget) throw new Error('Data entry cannot be moved above a data entry that does not exist.')
      if (aboveTarget.folderInternalId) {
        folder = await this.svc(DataFolderServiceInternal).findByInternalId(aboveTarget.folderInternalId)
      } else if (aboveTarget.siteId) {
        site = await this.svc(SiteServiceInternal).findById(aboveTarget.siteId)
      }
    } else if (target.folderId) {
      folder = await this.svc(DataFolderServiceInternal).findById(target.folderId)
      if (!folder) throw new Error('Data cannot be moved to a data folder that does not exist.')
    } else if (target.siteId) {
      site = await this.svc(SiteServiceInternal).findById(target.siteId)
      if (!site) throw new Error('Data cannot be moved to a site that does not exist.')
    }

    if (folder) {
      if (!this.svc(DataFolderService).mayCreate(folder)) throw new Error(`You are not permitted to move data to folder ${String(folder.name)}.`)
      if (folder.templateId !== template.id) throw new Error('Data can only be moved to a folder using the same template.')
    }
    if (site) {
      const dataroot = new DataRoot(site, template)
      if (!this.svc(DataRootService).mayCreate(dataroot)) {
        throw new Error(`Current user is not permitted to move data to this site ${String(site.name)}.`)
      }
    }
    // if none of these are provided, they are moving the data to global data
    if (!folder && !site && !(await this.mayCreateGlobal(template.id))) throw new Error('Current user is not permitted to update global data entries.')

    const versionedService = this.svc(VersionedService)
    await moveDataEntries(versionedService, data.map(d => d.dataId), templateKeys[0], target)
    this.loaders.clear()
    const updated = await this.raw.findByIds(data.map(d => d.dataId))
    return new DataMultResponse({ success: true, data: updated })
  }

  async publish (dataIds: string[]) {
    let data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayPublish(d))) {
      throw new Error('You are not permitted to publish one or more data entries.')
    }
    data = data.filter(d => !d.deleted)
    await db.transaction(async db => {
      for (const d of data) await this.svc(VersionedService).tag(d.intDataId, 'published', undefined, this.login, undefined, db)
    })
    this.loaders.clear()
    return new ValidatedResponse({ success: true })
  }

  async unpublish (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayUnpublish(d))) {
      throw new Error('You are not permitted to unpublish one or more data entries.')
    }
    await this.svc(VersionedService).removeTags(data.map(d => d.intDataId), ['published'])
    this.loaders.clear()
    return new ValidatedResponse({ success: true })
  }

  async delete (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayDelete(d))) {
      throw new Error('You are not permitted to delete one or more data entries.')
    }
    try {
      await deleteDataEntries(this.svc(VersionedService), data, this.ctx.authInfo.user!.internalId)
      this.loaders.clear()
      const updated = await this.raw.findByIds(data.map(d => d.dataId))
      return new DataMultResponse({ success: true, data: updated })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to delete one or more data entries.')
    }
  }

  async publishDataEntryDeletions (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayDelete(d))) {
      throw new Error('Current user is not permitted to delete one or more data entries.')
    }
    await publishDataEntryDeletions(data, this.ctx.authInfo.user!.internalId)
    this.loaders.clear()
    const updated = await this.raw.findByIds(data.map(d => d.dataId))
    return new DataMultResponse({ success: true, data: updated })
  }

  async undelete (dataIds: string[]) {
    const data = (await Promise.all(dataIds.map(async id => await this.raw.findById(id)))).filter(isNotNull)
    if (data.some(d => !this.mayUndelete(d))) {
      throw new Error('Current user is not permitted to restore one or more data entries')
    }
    try {
      await undeleteDataEntries(data)
      this.loaders.clear()
      const restored = await this.raw.findByIds(data.map(d => d.dataId))
      return new DataMultResponse({ success: true, data: restored })
    } catch (err: any) {
      console.error(err)
      throw new Error('Unable to restore one or more data entries')
    }
  }

  async isPublished (data: Data) {
    const tag = await this.svc(VersionedService).getTag(data.intDataId, 'published')
    return !!tag
  }

  mayView (data: Data) {
    if (data.published) return true
    const folderPathWithoutSite = popPath(data.resolvedPathWithoutSitename)
    for (const r of this.ctx.authInfo.dataRules) {
      if (!r.grants.view) continue
      if (!DataRuleService.appliesToSiteAndTemplate(r, data)) continue
      if (data.deleteState === DeleteState.DELETED && !r.grants.undelete) continue
      if (data.deleteState === DeleteState.MARKEDFORDELETE && !r.grants.delete) continue
      if (DataRuleService.appliesToPath(r, folderPathWithoutSite)) return true
    }
    return false
  }

  mayViewLatest (data: Data) {
    return this.haveDataPerm(data, 'viewlatest')
  }

  mayViewIndividual (data: Data) {
    return (!data.orphaned && data.deleteState === DeleteState.NOTDELETED) || this.mayView(data)
  }

  mayViewManagerUI () {
    return this.ctx.authInfo.dataRules.some(r => r.grants.viewForEdit)
  }

  mayViewForEdit (data: Data) {
    return this.haveDataPerm(data, 'viewForEdit')
  }

  mayUpdate (data: Data) {
    return this.haveDataPerm(data, 'update')
  }

  mayMove (data: Data) {
    return this.haveDataPerm(data, 'move')
  }

  mayPublish (data: Data) {
    const tmpl = templateRegistry.getDataTemplate(data.templateKey)
    return !tmpl?.nopublish && this.haveDataPerm(data, 'publish')
  }

  mayUnpublish (data: Data) {
    const tmpl = templateRegistry.getDataTemplate(data.templateKey)
    return !tmpl?.nopublish && data.published && this.haveDataPerm(data, 'unpublish')
  }

  mayDelete (data: Data) {
    return this.haveDataPerm(data, 'delete')
  }

  mayUndelete (data: Data) {
    if (data.deleteState === DeleteState.NOTDELETED || data.orphaned) return false
    return data.deleteState === DeleteState.MARKEDFORDELETE ? this.haveDataPerm(data, 'delete') : this.haveDataPerm(data, 'undelete')
  }

  async mayCreateGlobal (templateId: string) {
    return this.ctx.authInfo.dataRules.some(r => DataRuleService.appliesRaw(r, templateId, '/'))
  }
}
