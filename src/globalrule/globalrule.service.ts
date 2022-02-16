import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  getGlobalRules, GlobalRule, DosGatoService, tooPowerfulHelper, RoleService,
  CreateGlobalRuleInput, createGlobalRule, GlobalRuleResponse, UpdateGlobalRuleInput,
  updateGlobalRule, deleteGlobalRule
} from 'internal'

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

export class GlobalRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(globalRulesByRoleLoader).load(roleId)
  }

  async create (args: CreateGlobalRuleInput) {
    const role = await this.svc(RoleService).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new GlobalRule({ roleId: args.roleId, ...args.grants })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    try {
      const ruleId = await createGlobalRule(args)
      this.loaders.clear()
      const rule = await this.loaders.get(globalRulesByIdLoader).load(String(ruleId))
      return new GlobalRuleResponse({ globalRule: rule, success: true })
    } catch (err) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the global rule.')
    }
  }

  async update (args: UpdateGlobalRuleInput) {
    const rule = await this.loaders.get(globalRulesByIdLoader).load(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this global rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new GlobalRule({
      id: '0',
      roleId: rule.roleId,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updateGlobalRule(args)
      this.loaders.clear()
      const updatedRule = await this.loaders.get(globalRulesByIdLoader).load(args.ruleId)
      return new GlobalRuleResponse({ globalRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the global rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(globalRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    // TODO: what permissions need to be checked for deleting rules?
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
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
