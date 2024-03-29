import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Cache } from 'txstate-utils'
import {
  DosGatoService, tooPowerfulHelper, getSiteRules, SiteRule, type SiteRuleFilter,
  type CreateSiteRuleInput, RoleService, createSiteRule, SiteRuleResponse, type UpdateSiteRuleInput,
  deleteSiteRule, updateSiteRule, type Pagetree, RoleServiceInternal
} from '../internal.js'

const siteRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSiteRules({ ids })
  }
})

const siteRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: SiteRuleFilter) => {
    return await getSiteRules({ ...filter, roleIds })
  },
  extractKey: (r: SiteRule) => r.roleId,
  keysFromFilter: (filter: SiteRuleFilter | undefined) => filter?.roleIds ?? []
})

const siteRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getSiteRules({ siteIds }),
  extractKey: r => r.siteId!,
  idLoader: siteRulesByIdLoader
})

const globalSiteRulesCache = new Cache(async () => await getSiteRules({ siteIds: [null] }), { freshseconds: 3 })

export class SiteRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(siteRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: SiteRuleFilter) {
    return await this.loaders.get(siteRulesByRoleLoader, filter).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    const [siteSpecificSiteRules, globalSiteRules] = await Promise.all([
      siteId ? this.loaders.get(siteRulesBySiteLoader).load(siteId) : [],
      globalSiteRulesCache.get()
    ])
    return [...siteSpecificSiteRules, ...globalSiteRules]
  }

  async findByPagetree (pagetree: Pagetree) {
    // TODO: Do these need to be filtered? Any rules that apply to the site will apply to this pagetree
    return await this.findBySiteId(pagetree?.siteId)
  }
}

export class SiteRuleService extends DosGatoService<SiteRule> {
  raw = this.svc(SiteRuleServiceInternal)

  async findById (ruleId: string) {
    return this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string, filter?: SiteRuleFilter) {
    return this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId?: string) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByPagetree (pagetree: Pagetree) {
    return this.removeUnauthorized(await this.raw.findByPagetree(pagetree))
  }

  async create (args: CreateSiteRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new SiteRule({ id: '0', roleId: args.roleId, siteId: args.siteId, ...args.grants })
    const response = new SiteRuleResponse({ success: true })
    const rules = await this.findByRoleId(args.roleId)
    if (rules.some((r: SiteRule) => {
      return r.siteId === args.siteId
    })) {
      response.addMessage('The proposed rule has the same site as an existing rule for this role.')
    }
    if (this.tooPowerful(newRule)) response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    const ruleId = await createSiteRule(args)
    this.loaders.clear()
    if (!newRule.siteId) await globalSiteRulesCache.clear()
    response.siteRule = await this.loaders.get(siteRulesByIdLoader).load(String(ruleId))
    return response
  }

  async update (args: UpdateSiteRuleInput, validateOnly?: boolean) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this site rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new SiteRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId,
      ...updatedGrants
    })
    const response = new SiteRuleResponse({ success: true })
    if (this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    await updateSiteRule(args)
    this.loaders.clear()
    if (!rule.siteId || !newRule.siteId) await globalSiteRulesCache.clear()
    response.siteRule = await this.raw.findById(args.ruleId)
    return response
  }

  async delete (ruleId: string) {
    const rule = await this.raw.findById(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to remove this site rule.')
    try {
      await deleteSiteRule(ruleId)
      this.loaders.clear()
      if (!rule.siteId) await globalSiteRulesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the site rule.')
    }
  }

  static applies (rule: SiteRule, siteId: string) {
    if (rule.siteId && rule.siteId !== siteId) return false
    return true
  }

  asOrMorePowerful (ruleA: SiteRule, ruleB: SiteRule) { // is ruleA equal or more powerful than ruleB?
    return !ruleA.siteId || ruleA.siteId === ruleB.siteId
  }

  tooPowerful (rule: SiteRule) {
    return tooPowerfulHelper(rule, this.ctx.authInfo.siteRules, this.asOrMorePowerful)
  }

  async mayWrite (rule: SiteRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return this.svc(RoleService).mayUpdate(role!)
  }

  mayView (rule: SiteRule) {
    // rules can only be viewed underneath roles, so the role's mayView function can be relied upon here
    return true
  }
}
