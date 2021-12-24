import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { CreateAssetRuleInput } from '.'
import { Asset, AssetService } from '../asset'
import { AssetFolder, AssetFolderService } from '../assetfolder'
import { RulePathMode } from '../pagerule'
import { DosGatoService } from '../util/authservice'
import { comparePathsWithMode, tooPowerfulHelper } from '../util/rules'
import { createAssetRule, getAssetRules } from './assetrule.database'
import { AssetRule, AssetRuleResponse } from './assetrule.model'

const assetRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getAssetRules({ ids })
  }
})

const assetRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getAssetRules({ roleIds })
  },
  extractKey: (r: AssetRule) => r.roleId,
  idLoader: [assetRulesByIdLoader]
})

export class AssetRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(assetRulesByRoleLoader).load(roleId)
  }

  async create (args: CreateAssetRuleInput) {
    // TODO: Check if current user can create an asset rule
    try {
      const ruleId = await createAssetRule(args)
      const rule = await this.loaders.get(assetRulesByIdLoader).load(ruleId)
      return new AssetRuleResponse({ assetRule: rule, success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while creating the role.')
    }
  }

  async applies (rule: AssetRule, asset: Asset) {
    const site = await this.svc(AssetService).getSite(asset)
    if (!site) return false
    if (rule.siteId && rule.siteId !== site.id) return false
    const assetPath = await this.svc(AssetService).getPath(asset)
    if (rule.mode === RulePathMode.SELF && rule.path !== assetPath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !assetPath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === assetPath || !assetPath.startsWith(rule.path))) return false
    return true
  }

  async appliesToFolder (rule: AssetRule, folder: AssetFolder) {
    if (rule.siteId && rule.siteId !== folder.siteId) return false
    const folderPath = await this.svc(AssetFolderService).getPath(folder)
    if (rule.mode === RulePathMode.SELF && rule.path !== folderPath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !folderPath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === folderPath || !folderPath.startsWith(rule.path))) return false
    return true
  }

  asOrMorePowerful (ruleA: AssetRule, ruleB: AssetRule) { // is ruleA equal or more powerful than ruleB?
    if (ruleA.siteId && ruleA.siteId !== ruleB.siteId) return false
    return comparePathsWithMode(ruleA, ruleB)
  }

  async tooPowerful (rule: AssetRule) {
    return tooPowerfulHelper(rule, await this.currentAssetRules(), this.asOrMorePowerful)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
