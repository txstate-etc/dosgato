import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Asset, AssetService } from '../asset'
import { RulePathMode } from '../pagerule'
import { getAssetRules } from './assetrule.database'
import { AssetRule } from './assetrule.model'

const assetRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getAssetRules(roleIds)
  },
  extractKey: (r: AssetRule) => r.roleId
})

export class AssetRuleService extends AuthorizedService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(assetRulesByRoleLoader).load(roleId)
  }

  async applies (rule: AssetRule, asset: Asset) {
    const site = await this.svc(AssetService).getSite(asset)
    if (!site) return false
    if (rule.siteId && rule.siteId !== site.id) return false
    const pagePath = await this.svc(AssetService).getPath(asset)
    if (rule.mode === RulePathMode.SELF && rule.path !== pagePath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !pagePath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === pagePath || !pagePath.startsWith(rule.path))) return false
    return true
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
