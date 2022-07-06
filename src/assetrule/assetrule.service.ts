import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, filterAsync } from 'txstate-utils'
import {
  Asset, AssetRule, AssetRuleResponse, AssetRuleFilter, AssetFolder,
  comparePathsWithMode, createAssetRule, CreateAssetRuleInput, DosGatoService,
  getAssetRules, RulePathMode, RoleService, tooPowerfulHelper, UpdateAssetRuleInput,
  updateAssetRule, deleteAssetRule, AssetServiceInternal, AssetFolderServiceInternal, RoleServiceInternal
} from '../internal.js'

const assetRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getAssetRules({ ids })
  }
})

const assetRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: AssetRuleFilter) => {
    return await getAssetRules({ ...filter, roleIds })
  },
  keysFromFilter: (filter: AssetRuleFilter | undefined) => filter?.roleIds ?? [],
  extractKey: (r: AssetRule) => r.roleId,
  idLoader: assetRulesByIdLoader
})

const assetRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getAssetRules({ siteIds }),
  extractKey: r => r.siteId!,
  idLoader: assetRulesByIdLoader
})

const globalAssetRulesCache = new Cache(async () => await getAssetRules({ siteIds: [null] }), { freshseconds: 3 })

export class AssetRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(assetRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: AssetRuleFilter) {
    return await this.loaders.get(assetRulesByRoleLoader, filter).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    // dataloader can't handle loading nulls so we have to grab global assetrules separately
    const [siteRules, globalRules] = await Promise.all([
      siteId ? this.loaders.get(assetRulesBySiteLoader).load(siteId) : [],
      globalAssetRulesCache.get()]
    )
    return [...siteRules, ...globalRules]
  }

  async findByAsset (asset: Asset) {
    const folder = await this.svc(AssetFolderServiceInternal).findByInternalId(asset.folderInternalId)
    const rules = await this.findBySiteId(folder?.siteId)
    return await filterAsync(rules, async r => await this.svc(AssetRuleService).applies(r, asset))
  }

  async findByAssetFolder (folder: AssetFolder) {
    const rules = await this.findBySiteId(folder?.siteId)
    return await filterAsync(rules, async r => await this.svc(AssetRuleService).appliesToFolder(r, folder))
  }
}

export class AssetRuleService extends DosGatoService<AssetRule> {
  raw = this.svc(AssetRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string, filter?: AssetRuleFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId?: string) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByAsset (asset: Asset) {
    return await this.removeUnauthorized(await this.raw.findByAsset(asset))
  }

  async findByAssetFolder (folder: AssetFolder) {
    return await this.removeUnauthorized(await this.raw.findByAssetFolder(folder))
  }

  async create (args: CreateAssetRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new AssetRule({ id: '0', roleId: args.roleId, siteId: args.siteId, path: args.path ?? '/', mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    const rules = await this.findByRoleId(args.roleId)
    const response = new ValidatedResponse()
    if (rules.some((r: AssetRule) => {
      if (r.siteId !== args.siteId) return false
      if (!args.path) {
        return r.path === '/'
      } else return r.path === args.path
    })) {
      response.addMessage('The proposed rule has the same site and path as an existing rule for this role.', undefined, MutationMessageType.error)
    }
    if (await this.tooPowerful(newRule)) {
      response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.', undefined, MutationMessageType.error)
    }
    if (response.hasErrors()) return response
    if (!validateOnly) {
      try {
        const ruleId = await createAssetRule(args)
        this.loaders.clear()
        if (!newRule.siteId) await globalAssetRulesCache.clear()
        const rule = await this.raw.findById(String(ruleId))
        return new AssetRuleResponse({ assetRule: rule, success: true })
      } catch (err: any) {
        console.error(err)
        throw new Error('An unknown error occurred while creating the role.')
      }
    } else {
      return new ValidatedResponse({ success: true })
    }
  }

  async update (args: UpdateAssetRuleInput) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this asset rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new AssetRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId ?? rule.siteId,
      path: args.path ?? rule.path,
      mode: args.mode ?? rule.mode,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updateAssetRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await globalAssetRulesCache.clear()
      const updatedRule = await this.raw.findById(args.ruleId)
      return new AssetRuleResponse({ assetRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the asset rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(assetRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!(await this.mayWrite(rule))) throw new Error('Current user is not permitted to delete this asset rule.')
    try {
      await deleteAssetRule(ruleId)
      this.loaders.clear()
      if (!rule.siteId) await globalAssetRulesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the asset rule.')
    }
  }

  async applies (rule: AssetRule, asset: Asset) {
    const site = await this.svc(AssetServiceInternal).getSite(asset)
    if (!site) return false
    if (rule.siteId && rule.siteId !== site.id) return false
    const assetPath = await this.svc(AssetServiceInternal).getPath(asset)
    if (rule.mode === RulePathMode.SELF && rule.path !== assetPath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !assetPath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === assetPath || !assetPath.startsWith(rule.path))) return false
    return true
  }

  async appliesToFolder (rule: AssetRule, folder: AssetFolder) {
    if (rule.siteId && rule.siteId !== folder.siteId) return false
    const folderPath = await this.svc(AssetFolderServiceInternal).getPath(folder)
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

  async mayView (rule: AssetRule) {
    if (await this.haveGlobalPerm('manageUsers')) return true
    const role = await this.svc(RoleServiceInternal).findById(rule.roleId)
    return !!role
  }

  async mayWrite (rule: AssetRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }
}
