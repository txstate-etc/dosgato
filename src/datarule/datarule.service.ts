import { OneToManyLoader } from 'dataloader-factory'
import { tooPowerfulHelper, DosGatoService, Data, DataService, DataFolder, getDataRules, DataRule } from 'internal'

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
    return dataPath.startsWith(rule.path)
  }

  async appliesToFolder (rule: DataRule, folder: DataFolder) {
    if (!folder.siteId && rule.siteId) return false
    if (rule.siteId && rule.siteId !== folder.siteId) return false
    const folderPath = `/${folder.name as string}`
    return folderPath.startsWith(rule.path)
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
