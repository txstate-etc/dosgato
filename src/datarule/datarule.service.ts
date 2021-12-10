import { OneToManyLoader } from 'dataloader-factory'
import { Data, DataService } from '../data'
import { DosGatoService } from '../util/authservice'
import { tooPowerfulHelper } from '../util/rules'
import { getDataRules } from './datarule.database'
import { DataRule } from './datarule.model'

const dataRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getDataRules(roleIds)
  },
  extractKey: (r: DataRule) => r.roleId
})

export class DataRuleService extends DosGatoService {
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

  asOrMorePowerful (ruleA: DataRule, ruleB: DataRule) { // is ruleA equal or more powerful than ruleB?
    if (ruleA.siteId && ruleA.siteId !== ruleB.siteId) return false
    return ruleB.path.startsWith(ruleA.path)
  }

  async tooPowerful (rule: DataRule) {
    return tooPowerfulHelper(rule, await this.currentDataRules(), this.asOrMorePowerful)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
