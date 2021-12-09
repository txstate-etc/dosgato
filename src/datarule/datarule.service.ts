import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Data, DataService } from '../data'
import { RulePathMode } from '../pagerule'
import { getDataRules } from './datarule.database'
import { DataRule } from './datarule.model'

const dataRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getDataRules(roleIds)
  },
  extractKey: (r: DataRule) => r.roleId
})

export class DataRuleService extends AuthorizedService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(dataRulesByRoleLoader).load(roleId)
  }

  async applies (rule: DataRule, item: Data) {
    if (!item.siteId && rule.siteId) return false
    if (rule.siteId && rule.siteId !== item.siteId) return false
    const dataPath = await this.svc(DataService).getPath(item)
    if (!dataPath.startsWith(rule.path)) return false
    return true
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
