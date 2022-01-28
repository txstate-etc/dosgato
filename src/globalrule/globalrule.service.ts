import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  getGlobalRules, GlobalRule, DosGatoService, tooPowerfulHelper, RoleService,
  CreateGlobalRuleInput, createGlobalRule, GlobalRuleResponse
} from 'internal'

const globalRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
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
      const rule = await this.loaders.get(globalRulesByIdLoader).load(ruleId)
      return new GlobalRuleResponse({ globalRule: rule, success: true })
    } catch (err) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the global rule.')
    }
  }

  async applies (rule: GlobalRule) {
    return true // global rules always apply but we provide this function to match coding style of other rules
  }

  async tooPowerful (rule: GlobalRule) {
    return tooPowerfulHelper(rule, await this.currentGlobalRules(), () => true)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
