import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { ValidatedResponse } from '@txstate-mws/graphql-server'
import { Cache } from 'txstate-utils'
import {
  Site, DosGatoService, tooPowerfulHelper, getSiteRules, SiteRule, SiteRuleFilter,
  CreateSiteRuleInput, RoleService, createSiteRule, SiteRuleResponse, UpdateSiteRuleInput,
  deleteSiteRule, updateSiteRule, Pagetree, SiteService
} from 'internal'

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

export class SiteRuleService extends DosGatoService {
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

  async create (args: CreateSiteRuleInput) {
    const role = await this.svc(RoleService).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new SiteRule({ id: '0', roleId: args.roleId, siteId: args.siteId, ...args.grants })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    try {
      const ruleId = await createSiteRule(args)
      this.loaders.clear()
      if (!newRule.siteId) await globalSiteRulesCache.clear()
      const rule = await this.loaders.get(siteRulesByIdLoader).load(String(ruleId))
      return new SiteRuleResponse({ siteRule: rule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the site rule.')
    }
  }

  async update (args: UpdateSiteRuleInput) {
    const rule = await this.loaders.get(siteRulesByIdLoader).load(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this site rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new SiteRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId ?? rule.siteId,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updateSiteRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await globalSiteRulesCache.clear()
      const updatedRule = await this.loaders.get(siteRulesByIdLoader).load(args.ruleId)
      return new SiteRuleResponse({ siteRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the asset rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(siteRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    // TODO: what permissions need to be checked for deleting rules?
    try {
      await deleteSiteRule(ruleId)
      this.loaders.clear()
      if (!rule.siteId) await globalSiteRulesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the site rule.')
    }
  }

  async applies (rule: SiteRule, site: Site) {
    if (rule.siteId && rule.siteId !== site.id) return false
    return true
  }

  asOrMorePowerful (ruleA: SiteRule, ruleB: SiteRule) { // is ruleA equal or more powerful than ruleB?
    return !ruleA.siteId || ruleA.siteId === ruleB.siteId
  }

  async tooPowerful (rule: SiteRule) {
    return tooPowerfulHelper(rule, await this.currentSiteRules(), this.asOrMorePowerful)
  }

  async mayWrite (rule: SiteRule) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayView (rule: SiteRule) {
    return true
  }
}
