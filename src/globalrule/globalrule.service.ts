import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  getGlobalRules, GlobalRule, DosGatoService, tooPowerfulHelper, RoleService,
  CreateGlobalRuleInput, createGlobalRule, GlobalRuleResponse, UpdateGlobalRuleInput,
  updateGlobalRule, deleteGlobalRule, RoleServiceInternal
} from '../internal.js'

const globalRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getGlobalRules({ ids })
  }
})
const globalRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getGlobalRules({ roleIds })
  },
  extractKey: (r: GlobalRule) => r.roleId
})

export class GlobalRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(globalRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string) {
    return await this.loaders.get(globalRulesByRoleLoader).load(roleId)
  }
}

export class GlobalRuleService extends DosGatoService<GlobalRule> {
  raw = this.svc(GlobalRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId))
  }

  async create (args: CreateGlobalRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const response = new GlobalRuleResponse({ success: true })
    const newRule = new GlobalRule({ roleId: args.roleId, ...args.grants })
    if (await this.tooPowerful(newRule)) response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    const ruleId = await createGlobalRule(args)
    this.loaders.clear()
    const rule = await this.raw.findById(String(ruleId))
    response.globalRule = rule
    return response
  }

  async update (args: UpdateGlobalRuleInput, validateOnly?: boolean) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this global rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new GlobalRule({
      id: '0',
      roleId: rule.roleId,
      ...updatedGrants
    })
    const response = new GlobalRuleResponse({ success: true })
    if (await this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    await updateGlobalRule(args)
    this.loaders.clear()
    const updatedRule = await this.raw.findById(args.ruleId)
    response.globalRule = updatedRule
    return response
  }

  async delete (ruleId: string) {
    const rule = await this.raw.findById(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!(await this.mayWrite(rule))) throw new Error('Current user is not permitted to delete this global rule.')
    try {
      await deleteGlobalRule(ruleId)
      this.loaders.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the global rule.')
    }
  }

  async applies (rule: GlobalRule) {
    return true // global rules always apply but we provide this function to match coding style of other rules
  }

  async tooPowerful (rule: GlobalRule) {
    return tooPowerfulHelper(rule, await this.currentGlobalRules(), () => true)
  }

  async mayWrite (rule: GlobalRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }

  async mayView (rule: GlobalRule) {
    if (await this.haveGlobalPerm('manageAccess')) return true
    const role = await this.svc(RoleServiceInternal).findById(rule.roleId)
    return !!role
  }

  async mayOverrideStamps () {
    return await this.haveGlobalPerm('createSites')
  }
}
