import { OneToManyLoader } from 'dataloader-factory'
import { Site } from '../site'
import { DosGatoService } from '../util/authservice'
import { tooPowerfulHelper } from '../util/rules'
import { getSiteRules } from './siterule.database'
import { SiteRule, SiteRuleFilter } from './siterule.model'

const siteRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: SiteRuleFilter) => {
    return await getSiteRules({ ...filter, roleIds })
  },
  extractKey: (r: SiteRule) => r.roleId,
  keysFromFilter: (filter: SiteRuleFilter | undefined) => filter?.roleIds ?? []
})

export class SiteRuleService extends DosGatoService {
  async findByRoleId (roleId: string, filter?: SiteRuleFilter) {
    return await this.loaders.get(siteRulesByRoleLoader, filter).load(roleId)
  }

  async applies (rule: SiteRule, site: Site) {
    if (rule.siteId && rule.siteId !== site.id) return false
    return true
  }

  asOrMorePowerful (ruleA: SiteRule, ruleB: SiteRule) { // is ruleA equal or more powerful than ruleB?
    return !ruleA.siteId || ruleA.siteId === ruleB.siteId
  }

  async tooPowerful (rule: SiteRule) {
    return tooPowerfulHelper(rule, await this.currentSiteRules(), this.asOrMorePowerful)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
