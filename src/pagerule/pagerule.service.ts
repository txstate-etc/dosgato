import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getPageRules } from './pagerule.database'
import { PageRule } from './pagerule.model'

const pageRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getPageRules(roleIds)
  },
  extractKey: (r: PageRule) => r.roleId
})

export class PageRuleService extends AuthorizedService {
  async getRules (roleId: string) {
    return await this.loaders.get(pageRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
