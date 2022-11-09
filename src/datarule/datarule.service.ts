import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, filterAsync, isNotNull } from 'txstate-utils'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  tooPowerfulHelper, DosGatoService, Data, DataService, DataFolder, getDataRules, DataRule,
  createDataRule, CreateDataRuleInput, updateDataRule, UpdateDataRuleInput, deleteDataRule,
  RoleService, DataRuleFilter, DataRuleResponse, RoleServiceInternal, DataServiceInternal, DataFolderService
} from '../internal.js'

const dataRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getDataRules({ ids })
  }
})

const dataRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: DataRuleFilter) => {
    return await getDataRules({ ...filter, roleIds })
  },
  extractKey: (r: DataRule) => r.roleId
})

const dataRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getDataRules({ siteIds }),
  extractKey: r => r.siteId!
})

const dataRulesByTemplateLoader = new OneToManyLoader({
  fetch: async (templateIds: string[]) => await getDataRules({ templateIds }),
  extractKey: (r: DataRule) => String(r.templateId!)
})

const dataRulesForAllSitesCache = new Cache(async () => await getDataRules({ siteIds: [null] }), { freshseconds: 3 })
const dataRulesForAllTemplatesCache = new Cache(async () => await getDataRules({ templateIds: [null] }), { freshseconds: 3 })

export class DataRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(dataRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: DataRuleFilter) {
    return await this.loaders.get(dataRulesByRoleLoader, filter).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    const dataRulesForSite = siteId ? await this.loaders.get(dataRulesBySiteLoader).load(siteId) : []
    const globalRules = await dataRulesForAllSitesCache.get()
    return [...dataRulesForSite, ...globalRules]
  }

  async findByTemplateId (templateId?: string) {
    const dataRulesForTemplate = templateId ? await this.loaders.get(dataRulesByTemplateLoader).load(templateId) : []
    const globalRules = await dataRulesForAllTemplatesCache.get()
    return [...dataRulesForTemplate, ...globalRules]
  }

  async findByDataEntry (data: Data) {
    // a data entry can have a site, folder, or neither
    let folderRules: DataRule[] = []
    if (data.folderInternalId) {
      const folder = await this.svc(DataFolderService).findByInternalId(data.folderInternalId)
      folderRules = await this.findByDataFolder(folder!)
    } else {
      // TODO: What if the data is not in a folder?
    }
    const siteDataRules = await this.findBySiteId(data.siteId)
    const drService = this.svc(DataRuleService)
    return await filterAsync([...folderRules, ...siteDataRules], async rule => await drService.applies(rule, data))
  }

  async findByDataFolder (folder: DataFolder) {
    const [siteRules, templateRules] = await Promise.all([
      this.findBySiteId(folder.siteId),
      this.findByTemplateId(String(folder.templateId))
    ])
    const drService = this.svc(DataRuleService)
    // TODO: Should appliesToFolder be looking at the template ID for the rule and the folder to see if they match?
    return await filterAsync([...siteRules, ...templateRules], async rule => await drService.appliesToFolder(rule, folder))
  }
}

export class DataRuleService extends DosGatoService<DataRule> {
  raw = this.svc(DataRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.raw.findById(ruleId)
  }

  async findByRoleId (roleId: string, filter?: DataRuleFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId?: string) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByDataEntry (data: Data) {
    return await this.removeUnauthorized(await this.raw.findByDataEntry(data))
  }

  async findByDataFolder (folder: DataFolder) {
    return await this.removeUnauthorized(await this.raw.findByDataFolder(folder))
  }

  async create (args: CreateDataRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const response = new DataRuleResponse({ success: true })
    const newRule = new DataRule({ id: '0', roleId: args.roleId, siteId: args.siteId, templateId: args.templateId, path: args.path ?? '/', ...args.grants })
    if (await this.tooPowerful(newRule)) response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
    }
    if (validateOnly || response.hasErrors()) return response
    const ruleId = await createDataRule(args)
    this.loaders.clear()
    if (!newRule.siteId) await dataRulesForAllSitesCache.clear()
    const rule = await this.raw.findById(String(ruleId))
    response.dataRule = rule
    return response
  }

  async update (args: UpdateDataRuleInput, validateOnly?: boolean) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this data rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
    }
    const newRule = new DataRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId,
      templateId: args.templateId,
      path: args.path ?? '/',
      ...updatedGrants
    })
    const response = new DataRuleResponse({ success: true })
    if (await this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    await updateDataRule(args)
    this.loaders.clear()
    if (!rule.siteId || !newRule.siteId) await dataRulesForAllSitesCache.clear()
    const updatedRule = await this.raw.findById(args.ruleId)
    response.dataRule = updatedRule
    return response
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(dataRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!(await this.mayWrite(rule))) throw new Error('Current user is not permitted to delete this data rule.')
    try {
      await deleteDataRule(ruleId)
      this.loaders.clear()
      if (!rule.siteId) await dataRulesForAllSitesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the data rule.')
    }
  }

  async applies (rule: DataRule, item: Data) {
    if (!item.siteId && rule.siteId) return false
    if (rule.siteId && rule.siteId !== item.siteId) return false
    const dataPath = await this.svc(DataServiceInternal).getPath(item)
    return dataPath.startsWith(rule.path)
  }

  async appliesToFolder (rule: DataRule, folder: DataFolder) {
    if (!folder.siteId && rule.siteId) return false
    if (rule.siteId && rule.siteId !== folder.siteId) return false
    const folderPath = `/${folder.name as string}`
    return folderPath.startsWith(rule.path)
  }

  asOrMorePowerful (ruleA: DataRule, ruleB: DataRule) { // is ruleA equal or more powerful than ruleB?
    if (ruleA.siteId && ruleA.siteId !== ruleB.siteId) return false
    return ruleB.path.startsWith(ruleA.path)
  }

  async tooPowerful (rule: DataRule) {
    return tooPowerfulHelper(rule, await this.currentDataRules(), this.asOrMorePowerful)
  }

  async mayWrite (rule: DataRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }

  async mayView (rule: DataRule) {
    if (await this.haveGlobalPerm('manageAccess')) return true
    const role = await this.svc(RoleServiceInternal).findById(rule.roleId)
    return !!role
  }
}
