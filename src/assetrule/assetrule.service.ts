import { BaseService, ValidatedResponse, MutationMessageType } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, filterAsync, isNotNull } from 'txstate-utils'
import {
  type Asset, AssetRule, AssetRuleResponse, type AssetRuleFilter, type AssetFolder,
  comparePathsWithMode, createAssetRule, type CreateAssetRuleInput, DosGatoService,
  getAssetRules, RulePathMode, RoleService, tooPowerfulHelper, type UpdateAssetRuleInput,
  updateAssetRule, deleteAssetRule, AssetServiceInternal, AssetFolderServiceInternal,
  RoleServiceInternal, shiftPath, popPath
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
    const [rules, assetPath] = await Promise.all([
      this.findBySiteId(asset?.siteId),
      this.svc(AssetServiceInternal).getPath(asset)
    ])
    const assetPathWithoutSite = shiftPath(assetPath)
    return rules.filter(r => AssetRuleService.applies(r, asset, assetPathWithoutSite))
  }

  async findByAssetFolder (folder: AssetFolder) {
    const [rules, folderPath] = await Promise.all([
      this.findBySiteId(folder?.siteId),
      this.svc(AssetFolderServiceInternal).getPath(folder)
    ])
    const folderPathWithoutSite = shiftPath(folderPath)
    return rules.filter(r => AssetRuleService.applies(r, folder, folderPathWithoutSite))
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
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
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

  async update (args: UpdateAssetRuleInput, validateOnly?: boolean) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this asset rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
    }
    const newRule = new AssetRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId,
      path: args.path ?? '/',
      mode: args.mode ?? RulePathMode.SELFANDSUB,
      ...updatedGrants
    })
    const response = new AssetRuleResponse({ success: true })
    if (await this.tooPowerful(newRule)) {
      response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
    }
    if (response.hasErrors()) return response
    if (!validateOnly) {
      await updateAssetRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await globalAssetRulesCache.clear()
      const updatedRule = await this.raw.findById(args.ruleId)
      response.assetRule = updatedRule
    }
    return response
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

  static applies (rule: AssetRule, assetOrFolder: Asset | AssetFolder, pathWithoutSite: string) {
    return this.appliesToPagetree(rule, assetOrFolder) && this.appliesToPath(rule, pathWithoutSite)
  }

  static appliesToPagetree (r: AssetRule, assetOrFolder: Asset | AssetFolder) {
    return (!r.siteId || r.siteId === assetOrFolder.siteId) && (!r.pagetreeType || r.pagetreeType === assetOrFolder.pagetreeType)
  }

  static appliesToPath (rule: AssetRule, folderPathWithoutSite: string) {
    if (rule.mode === RulePathMode.SELF && rule.path !== folderPathWithoutSite) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !folderPathWithoutSite.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === folderPathWithoutSite || !folderPathWithoutSite.startsWith(rule.path))) return false
    return true
  }

  static appliesToChildOfPath (rule: AssetRule, folderPathWithoutSite: string) {
    if (rule.path.startsWith(folderPathWithoutSite + '/')) return true
    if (rule.mode === RulePathMode.SELFANDSUB && rule.path === folderPathWithoutSite) return true
    return false
  }

  static appliesToParentOfPath (rule: AssetRule, folderPathWithoutSite: string) {
    return this.appliesToPath(rule, popPath(folderPathWithoutSite))
  }

  asOrMorePowerful (ruleA: AssetRule, ruleB: AssetRule) { // is ruleA equal or more powerful than ruleB?
    if (ruleA.siteId && ruleA.siteId !== ruleB.siteId) return false
    if (ruleA.pagetreeType && ruleA.pagetreeType !== ruleB.pagetreeType) return false
    return comparePathsWithMode(ruleA, ruleB)
  }

  async tooPowerful (rule: AssetRule) {
    return tooPowerfulHelper(rule, await this.currentAssetRules(), this.asOrMorePowerful)
  }

  async mayView (rule: AssetRule) {
    if (await this.haveGlobalPerm('manageAccess')) return true
    const role = await this.svc(RoleService).findById(rule.roleId)
    return !!role
  }

  async mayWrite (rule: AssetRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }
}
