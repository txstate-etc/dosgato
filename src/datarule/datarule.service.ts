import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache } from 'txstate-utils'
import { ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  tooPowerfulHelper, DosGatoService, Data, DataService, DataFolder, getDataRules, DataRule,
  createDataRule, CreateDataRuleInput, updateDataRule, UpdateDataRuleInput, deleteDataRule,
  RoleService, DataRuleResponse
} from 'internal'

const dataRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getDataRules({ ids })
  }
})

const dataRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getDataRules({ roleIds })
  },
  extractKey: (r: DataRule) => r.roleId
})

const dataRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getDataRules({ siteIds }),
  extractKey: r => r.siteId!
})

const dataRulesForAllSitesCache = new Cache(async () => await getDataRules({ siteIds: [null] }), { freshseconds: 3 })

export class DataRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(dataRulesByRoleLoader).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    const dataRulesForSite = siteId ? await this.loaders.get(dataRulesBySiteLoader).load(siteId) : []
    const globalRules = await dataRulesForAllSitesCache.get()
    return [...dataRulesForSite, ...globalRules]
  }

  async create (args: CreateDataRuleInput) {
    const role = await this.svc(RoleService).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new DataRule({ id: '0', roleId: args.roleId, siteId: args.siteId, templateId: args.templateId, path: args.path ?? '/', ...args.grants })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    try {
      const ruleId = await createDataRule(args)
      this.loaders.clear()
      if (!newRule.siteId) await dataRulesForAllSitesCache.clear()
      const rule = await this.loaders.get(dataRulesByIdLoader).load(String(ruleId))
      return new DataRuleResponse({ dataRule: rule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the role.')
    }
  }

  async update (args: UpdateDataRuleInput) {
    const rule = await this.loaders.get(dataRulesByIdLoader).load(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this data rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new DataRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId ?? rule.siteId,
      templateId: args.templateId ?? rule.templateId,
      path: args.path ?? rule.path,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updateDataRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await dataRulesForAllSitesCache.clear()
      const updatedRule = await this.loaders.get(dataRulesByIdLoader).load(args.ruleId)
      return new DataRuleResponse({ dataRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the data rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(dataRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    // TODO: what permissions need to be checked for deleting rules?
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
    const dataPath = await this.svc(DataService).getPath(item)
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
    return true
  }
}
