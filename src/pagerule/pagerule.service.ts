import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  Page, PageRuleFilter, DosGatoService, comparePathsWithMode,
  tooPowerfulHelper, getPageRules, PageRule, RulePathMode, SiteService, CreatePageRuleInput,
  RoleService, createPageRule, PageRuleResponse, UpdatePageRuleInput, updatePageRule, deletePageRule, RoleServiceInternal, PagetreeServiceInternal, PageServiceInternal
} from '../internal.js'
import { Cache, filterAsync } from 'txstate-utils'

const pageRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPageRules({ ids })
  }
})

const pageRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: PageRuleFilter) => {
    return await getPageRules({ ...filter, roleIds })
  },
  extractKey: (r: PageRule) => r.roleId
})

const pageRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getPageRules({ siteIds }),
  extractKey: r => r.siteId!
})

// TODO: Need to check for pagetree type here?
const globalPageRulesCache = new Cache(async () => await getPageRules({ siteIds: [null] }), { freshseconds: 3 })

export class PageRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(pageRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: PageRuleFilter) {
    return await this.loaders.get(pageRulesByRoleLoader, filter).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    const pageRulesForSite = siteId ? await this.loaders.get(pageRulesBySiteLoader).load(siteId) : []
    const globalRules = await globalPageRulesCache.get()
    return [...pageRulesForSite, ...globalRules]
  }

  async findByPage (page: Page) {
    const site = await this.svc(SiteService).findByPagetreeId(page.pagetreeId)
    // Get the page rules that apply to the site
    const rules = await this.findBySiteId(site!.id)
    // filter to get the ones that apply to this page
    const prService = this.svc(PageRuleService)
    return await filterAsync(rules, async rule => await prService.applies(rule, page))
  }
}

export class PageRuleService extends DosGatoService<PageRule> {
  raw = this.svc(PageRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string, filter?: PageRuleFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId?: string) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByPage (page: Page) {
    return await this.removeUnauthorized(await this.raw.findByPage(page))
  }

  async create (args: CreatePageRuleInput) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new PageRule({ id: '0', path: args.path ?? '/', roleId: args.roleId, siteId: args.siteId, pagetreeType: args.pagetreeType, mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    if (await this.tooPowerful(newRule)) {
      return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    }
    try {
      const ruleId = await createPageRule(args)
      this.loaders.clear()
      if (!newRule.siteId) await globalPageRulesCache.clear()
      const rule = await this.raw.findById(String(ruleId))
      return new PageRuleResponse({ pageRule: rule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the page rule.')
    }
  }

  async update (args: UpdatePageRuleInput) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this page rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new PageRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId ?? rule.siteId,
      pagetreeType: args.pagetreeType ?? rule.pagetreeType,
      path: args.path ?? rule.path,
      mode: args.mode ?? rule.mode,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updatePageRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await globalPageRulesCache.clear()
      const updatedRule = await this.raw.findById(args.ruleId)
      return new PageRuleResponse({ pageRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the page rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.raw.findById(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to remove this page rule.')
    try {
      await deletePageRule(ruleId)
      this.loaders.clear()
      if (!rule.siteId) await globalPageRulesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the page rule.')
    }
  }

  async applies (rule: PageRule, page: Page) {
    const pagetree = await this.svc(PagetreeServiceInternal).findById(page.pagetreeId)
    if (!pagetree) return false
    if (rule.siteId && rule.siteId !== pagetree.siteId) return false
    if (rule.pagetreeType && rule.pagetreeType !== pagetree.type) return false
    const pagePath = await this.svc(PageServiceInternal).getPath(page)
    if (rule.mode === RulePathMode.SELF && rule.path !== pagePath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !pagePath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === pagePath || !pagePath.startsWith(rule.path))) return false
    return true
  }

  async mayView (rule: PageRule) {
    if (await this.haveGlobalPerm('manageAccess')) return true
    const role = await this.svc(RoleServiceInternal).findById(rule.roleId)
    return !!role
  }

  async mayWrite (rule: PageRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }

  asOrMorePowerful (ruleA: PageRule, ruleB: PageRule) { // is ruleA equal or more powerful than ruleB?
    let sitePagetreeMorePowerful = false
    if (!ruleA.siteId || ruleA.siteId === ruleB.siteId) { // ruleA is at least as powerful based on site alone
      if (!ruleA.pagetreeType || ruleA.pagetreeType === ruleB.pagetreeType) { // ruleA covers all pagetree types or the same one as ruleB
        sitePagetreeMorePowerful = true
      }
    }
    if (!sitePagetreeMorePowerful) return false
    return comparePathsWithMode(ruleA, ruleB)
  }

  async tooPowerful (rule: PageRule) {
    return tooPowerfulHelper(rule, await this.currentPageRules(), this.asOrMorePowerful)
  }
}
