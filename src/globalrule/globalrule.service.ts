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
  async getRules (roleId: string) {
    return await this.loaders.get(globalRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}