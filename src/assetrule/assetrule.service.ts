import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getAssetRules } from './assetrule.database'
import { AssetRule } from './assetrule.model'

const assetRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getAssetRules(roleIds)
  },
  extractKey: (r: AssetRule) => r.roleId
})

export class AssetRuleService extends AuthorizedService {
  async getRules (roleId: string) {
    return await this.loaders.get(assetRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
