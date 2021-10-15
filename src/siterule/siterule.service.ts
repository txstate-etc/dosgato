import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getSiteRules } from './siterule.database'
import { SiteRule } from './siterule.model'

const siteRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getSiteRules(roleIds)
  },
  extractKey: (r: SiteRule) => r.roleId
})

export class SiteRuleService extends AuthorizedService {
  async getRules (roleId: string) {
    return await this.loaders.get(siteRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
