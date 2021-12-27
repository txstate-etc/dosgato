import { OneToManyLoader } from 'dataloader-factory'
import { getGlobalRules, GlobalRule, DosGatoService, tooPowerfulHelper } from 'internal'

const globalRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getGlobalRules(roleIds)
  },
  extractKey: (r: GlobalRule) => r.roleId
})

export class GlobalRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(globalRulesByRoleLoader).load(roleId)
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
