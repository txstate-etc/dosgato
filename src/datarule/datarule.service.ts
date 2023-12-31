import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, isNotNull, pick } from 'txstate-utils'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  tooPowerfulHelper, DosGatoService, type Data, type DataFolder, getDataRules, DataRule,
  createDataRule, type CreateDataRuleInput, updateDataRule, type UpdateDataRuleInput, deleteDataRule,
  RoleService, type DataRuleFilter, DataRuleResponse, RoleServiceInternal, DataServiceInternal, shiftPath, DataFolderServiceInternal
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

const dataRulesForAllSitesCache = new Cache(async () => await getDataRules({ siteIds: [null], global: false }), { freshseconds: 3 })
const dataRulesForAllTemplatesCache = new Cache(async () => await getDataRules({ templateIds: [null] }), { freshseconds: 3 })

export class DataRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(dataRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: DataRuleFilter) {
    return await this.loaders.get(dataRulesByRoleLoader, filter).load(roleId)
  }

  async findBySiteId (siteId: string) {
    const dataRulesForSite = await this.loaders.get(dataRulesBySiteLoader).load(siteId)
    const globalRules = await dataRulesForAllSitesCache.get()
    return [...dataRulesForSite, ...globalRules]
  }

  async findByTemplateId (templateId?: string) {
    const dataRulesForTemplate = templateId ? await this.loaders.get(dataRulesByTemplateLoader).load(templateId) : []
    const globalRules = await dataRulesForAllTemplatesCache.get()
    return [...dataRulesForTemplate, ...globalRules]
  }

  async findByDataEntry (data: Data) {
    const [rules, dataPath] = await Promise.all([
      this.findByTemplateId(data.templateId),
      this.svc(DataServiceInternal).getPath(data)
    ])
    const dataPathWithoutSite = shiftPath(dataPath)
    return rules.filter(rule => DataRuleService.applies(rule, data, dataPathWithoutSite))
  }

  async findByDataFolder (folder: DataFolder) {
    const [rules, folderPath] = await Promise.all([
      this.findByTemplateId(folder.templateId),
      this.svc(DataFolderServiceInternal).getPath(folder)
    ])
    const folderPathWithoutSite = shiftPath(folderPath)
    return rules.filter(rule => DataRuleService.applies(rule, folder, folderPathWithoutSite))
  }
}

export class DataRuleService extends DosGatoService<DataRule> {
  raw = this.svc(DataRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.raw.findById(ruleId)
  }

  async findByRoleId (roleId: string, filter?: DataRuleFilter) {
    return this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId: string) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByDataEntry (data: Data) {
    return this.removeUnauthorized(await this.raw.findByDataEntry(data))
  }

  async findByDataFolder (folder: DataFolder) {
    return this.removeUnauthorized(await this.raw.findByDataFolder(folder))
  }

  async create (args: CreateDataRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const response = new DataRuleResponse({ success: true })
    const newRule = new DataRule({ id: '0', ...pick(args, 'roleId', 'siteId', 'global', 'templateId'), path: args.path ?? '/', ...args.grants })
    if (newRule.global && newRule.siteId) throw new Error('A rule that is limited to global data and also limited to a site cannot logically exist.')
    if (this.tooPowerful(newRule)) response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.')
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
      global: args.global,
      templateId: args.templateId,
      path: args.path ?? '/',
      ...updatedGrants
    })
    if (newRule.global && newRule.siteId) throw new Error('A rule that is limited to global data and also limited to a site cannot logically exist.')
    const response = new DataRuleResponse({ success: true })
    if (this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
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

  static applies (rule: DataRule, itemOrFolder: Data | DataFolder, pathWithoutSite: string) {
    return this.appliesToSiteAndTemplate(rule, itemOrFolder) && this.appliesToPath(rule, pathWithoutSite)
  }

  static appliesRaw (r: DataRule, templateId: string, pathWithoutSite: string, siteId?: string) {
    if (siteId && r.global) return false
    if (r.siteId && r.siteId !== siteId) return false
    if (r.templateId && r.templateId !== templateId) return false
    return this.appliesToPath(r, pathWithoutSite)
  }

  static appliesToSiteAndTemplate (r: DataRule, item: Data | DataFolder) {
    if (item.siteId && r.global) return false
    if (r.siteId && r.siteId !== item.siteId) return false
    if (r.templateId && r.templateId !== item.templateId) return false
    return true
  }

  static appliesToPath (r: DataRule, dataPathWithoutSite: string) {
    return dataPathWithoutSite.startsWith(r.pathSlash)
  }

  async appliesToFolder (rule: DataRule, folder: DataFolder) {
    if (!folder.siteId && rule.siteId) return false
    if (rule.siteId && rule.siteId !== folder.siteId) return false
    return folder.resolvedPath.startsWith(rule.pathSlash)
  }

  asOrMorePowerful (ruleA: DataRule, ruleB: DataRule) { // is ruleB unnecessary when ruleA is in effect?
    if (ruleA.global && ruleB.siteId) return false
    if (ruleA.siteId && (ruleA.siteId !== ruleB.siteId || ruleB.global)) return false
    return ruleB.pathSlash.startsWith(ruleA.pathSlash)
  }

  tooPowerful (rule: DataRule) {
    return tooPowerfulHelper(rule, this.ctx.authInfo.dataRules, this.asOrMorePowerful)
  }

  async mayWrite (rule: DataRule) {
    const role = await this.svc(RoleServiceInternal).findById(rule.id)
    return this.svc(RoleService).mayUpdate(role!)
  }

  mayView (rule: DataRule) {
    // rules can only be viewed underneath roles, so the role's mayView function can be relied upon here
    return true
  }
}
