import { ValidatedResponse } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, filterAsync } from 'txstate-utils'
import {
  Asset, AssetRule, AssetRuleResponse, AssetService, AssetFolder, AssetFolderService,
  comparePathsWithMode, createAssetRule, CreateAssetRuleInput, DosGatoService,
  getAssetRules, RulePathMode, RoleService, tooPowerfulHelper
} from 'internal'

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
  idLoader: assetRulesByIdLoader
})

const assetRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getAssetRules({ siteIds }),
  extractKey: r => r.siteId!,
  idLoader: assetRulesByIdLoader
})

const globalAssetRulesCache = new Cache(async () => await getAssetRules({ siteIds: [null] }), { freshseconds: 3 })

export class AssetRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(assetRulesByRoleLoader).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    // dataloader can't handle loading nulls so we have to grab global assetrules separately
    const [siteRules, globalRules] = await Promise.all([siteId ? this.loaders.get(assetRulesBySiteLoader).load(siteId) : [], globalAssetRulesCache.get()])
    return [...siteRules, ...globalRules]
  }

  async findByAsset (asset: Asset) {
    const folder = await this.svc(AssetFolderService).findByInternalId(asset.folderInternalId)
    const rules = await this.findBySiteId(folder?.siteId)
    return await filterAsync(rules, async r => await this.applies(r, asset))
  }

  async findByAssetFolder (folder: AssetFolder) {
    const rules = await this.findBySiteId(folder?.siteId)
    return await filterAsync(rules, async r => await this.appliesToFolder(r, folder))
  }

  async create (args: CreateAssetRuleInput) {
    const role = await this.svc(RoleService).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new AssetRule({ id: '0', roleId: args.roleId, siteId: args.siteId, path: args.path ?? '/', mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    try {
      const ruleId = await createAssetRule(args)
      this.loaders.clear()
      if (!newRule.siteId) await globalAssetRulesCache.clear()
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
