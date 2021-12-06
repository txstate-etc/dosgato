import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Site } from '../site'
import { getSiteRules } from './siterule.database'
import { SiteRule, SiteRuleFilter } from './siterule.model'

const siteRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: SiteRuleFilter) => {
    return await getSiteRules({ ...filter, roleIds })
  },
  extractKey: (r: SiteRule) => r.roleId,
  keysFromFilter: (filter: SiteRuleFilter | undefined) => filter?.roleIds ?? []
})

export class SiteRuleService extends AuthorizedService {
  async findByRoleId (roleId: string, filter?: SiteRuleFilter) {
    return await this.loaders.get(siteRulesByRoleLoader, filter).load(roleId)
  }

  async applies (rule: SiteRule, site: Site) {
    if (rule.siteId && rule.siteId !== site.id) return false
    return true
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
