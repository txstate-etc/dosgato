import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getGlobalRules } from './globalrules.database'
import { GlobalRule } from './globalrule.model'

const globalRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getGlobalRules(roleIds)
  },
  extractKey: (r: GlobalRule) => r.roleId
})

export class GlobalRuleService extends AuthorizedService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(globalRulesByRoleLoader).load(roleId)
  }

  async applies (rule: GlobalRule) {
    return true // global rules always apply but we provide this function to match coding style of other rules
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
