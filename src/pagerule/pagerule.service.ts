import { ValidatedResponse } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import {
  Page, PageService, PagetreeService, DosGatoService, comparePathsWithMode,
  tooPowerfulHelper, getPageRules, PageRule, RulePathMode, SiteService, CreatePageRuleInput,
  RoleService, createPageRule, PageRuleResponse, UpdatePageRuleInput, updatePageRule, deletePageRule
} from 'internal'
import { Cache, filterAsync } from 'txstate-utils'

const pageRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getPageRules({ ids })
  }
})

const pageRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getPageRules({ roleIds })
  },
  extractKey: (r: PageRule) => r.roleId
})

const pageRulesBySiteLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getPageRules({ siteIds }),
  extractKey: r => r.siteId!
})

const globalPageRulesCache = new Cache(async () => await getPageRules({ siteIds: [null], pagetreeIds: [null] }), { freshseconds: 3 })

export class PageRuleService extends DosGatoService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(pageRulesByRoleLoader).load(roleId)
  }

  async findBySiteId (siteId?: string) {
    const pageRulesForSite = siteId ? await this.loaders.get(pageRulesBySiteLoader).load(siteId) : []
    const globalRules = await globalPageRulesCache.get()
    return [...pageRulesForSite, ...globalRules]
  }

  async findByPage (page: Page) {
    const site = await this.svc(SiteService).findByPagetreeId(page.pagetreeId)
    // Get the page rules that apply to the site
    // TODO: Is it safe to assume that if a PageRule has a pagetreeId, it also has a siteId?
    // Or could there be a rule with a pagetreeId with siteId == null? In that case, we need to
    // find PageRules by pagetreeId too to make sure we get them all.
    const rules = await this.findBySiteId(site!.id)
    // filter to get the ones that apply to this page
    return await filterAsync(rules, async rule => await this.applies(rule, page))
  }

  async create (args: CreatePageRuleInput) {
    const role = await this.svc(RoleService).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new PageRule({ id: '0', path: args.path ?? '/', roleId: args.roleId, siteId: args.siteId, pagetreeId: args.pagetreeId, mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    if (await this.tooPowerful(newRule)) {
      return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    }
    try {
      const ruleId = await createPageRule(args)
      this.loaders.clear()
      if (!newRule.siteId && !newRule.pagetreeId) await globalPageRulesCache.clear()
      const rule = await this.loaders.get(pageRulesByIdLoader).load(String(ruleId))
      return new PageRuleResponse({ pageRule: rule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the page rule.')
    }
  }

  async update (args: UpdatePageRuleInput) {
    const rule = await this.loaders.get(pageRulesByIdLoader).load(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this page rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    const newRule = new PageRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId ?? rule.siteId,
      pagetreeId: args.pagetreeId ?? rule.pagetreeId,
      path: args.path ?? rule.path,
      mode: args.mode ?? rule.mode,
      ...updatedGrants
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated rule would have more privilege than you currently have, so you cannot create it.')
    try {
      await updatePageRule(args)
      this.loaders.clear()
      if (!rule.siteId || !newRule.siteId) await globalPageRulesCache.clear()
      const updatedRule = await this.loaders.get(pageRulesByIdLoader).load(args.ruleId)
      return new PageRuleResponse({ pageRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the page rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.loaders.get(pageRulesByIdLoader).load(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    // TODO: what permissions need to be checked for deleting rules?
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
    if (rule.pagetreeId && rule.pagetreeId !== page.pagetreeId) return false
    const pagetree = await this.svc(PagetreeService).findById(page.pagetreeId)
    if (!pagetree) return false
    if (rule.siteId && rule.siteId !== pagetree.siteId) return false
    const pagePath = await this.svc(PageService).getPath(page)
    if (rule.mode === RulePathMode.SELF && rule.path !== pagePath) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !pagePath.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === pagePath || !pagePath.startsWith(rule.path))) return false
    return true
  }

  async mayView (): Promise<boolean> {
    return true
  }

  async mayWrite (rule: PageRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }

  asOrMorePowerful (ruleA: PageRule, ruleB: PageRule) { // is ruleA equal or more powerful than ruleB?
    let sitePagetreeMorePowerful = false
    if (!ruleA.siteId || ruleA.siteId === ruleB.siteId) { // ruleA is at least as powerful based on site alone
      if (!ruleA.pagetreeId || ruleA.pagetreeId === ruleB.pagetreeId) { // pagetree is also at least as powerful
        sitePagetreeMorePowerful = true
      }
    } else if (!ruleB.siteId) { // ruleA is less powerful than ruleB based on site alone, but maybe pagetree will equalize
      if (ruleB.pagetreeId && ruleA.pagetreeId === ruleB.pagetreeId) {
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
