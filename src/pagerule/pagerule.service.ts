import { BaseService, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, isNotNull } from 'txstate-utils'
import {
  type Page, type PageRuleFilter, DosGatoService, comparePathsWithMode, tooPowerfulHelper, getPageRules,
  PageRule, RulePathMode, type CreatePageRuleInput, RoleService, createPageRule, PageRuleResponse,
  type UpdatePageRuleInput, updatePageRule, deletePageRule, RoleServiceInternal,
  popPath
} from '../internal.js'

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
    // Get the page rules that apply to the site
    const rules = await this.findBySiteId(page.siteId)
    // filter to get the ones that apply to this page
    return rules.filter(r => PageRuleService.appliesToPagetree(r, page) && PageRuleService.appliesToPath(r, page.resolvedPath))
  }
}

export class PageRuleService extends DosGatoService<PageRule> {
  raw = this.svc(PageRuleServiceInternal)

  async findById (ruleId: string) {
    return this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string, filter?: PageRuleFilter) {
    return this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async findBySiteId (siteId?: string) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async findByPage (page: Page) {
    return this.removeUnauthorized(await this.raw.findByPage(page))
  }

  async create (args: CreatePageRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new PageRule({ id: '0', path: args.path ?? '/', roleId: args.roleId, siteId: args.siteId, pagetreeType: args.pagetreeType, mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    const response = new PageRuleResponse({ success: true })
    const rules = await this.findByRoleId(args.roleId)
    if (rules.some((r: PageRule) => {
      if (r.siteId !== args.siteId) return false
      if (r.pagetreeType !== args.pagetreeType) return false
      if (!args.path) {
        return r.path === '/'
      } else return r.path === args.path
    })) {
      response.addMessage('The proposed rule has the same site, pagetree type, and path as an existing rule for this role.', undefined, MutationMessageType.error)
    }
    if (this.tooPowerful(newRule)) {
      response.addMessage('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    }
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
    }
    if (validateOnly || response.hasErrors()) return response
    const ruleId = await createPageRule(args)
    this.loaders.clear()
    if (!newRule.siteId) await globalPageRulesCache.clear()
    const rule = await this.raw.findById(String(ruleId))
    response.pageRule = rule
    return response
  }

  async update (args: UpdatePageRuleInput, validateOnly?: boolean) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this page rule.')
    const updatedGrants = { ...rule.grants, ...args.grants }
    if (isNotNull(args.path)) {
      args.path = (args.path.startsWith('/') ? '' : '/') + args.path
      if (args.path !== '/' && args.path.endsWith('/')) {
        args.path = args.path.slice(0, -1)
      }
    }
    const newRule = new PageRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.siteId,
      pagetreeType: args.pagetreeType,
      path: args.path ?? '/',
      mode: args.mode ?? RulePathMode.SELFANDSUB,
      ...updatedGrants
    })
    const response = new PageRuleResponse({ success: true })
    if (this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
    if (validateOnly || response.hasErrors()) return response
    await updatePageRule(args)
    this.loaders.clear()
    if (!rule.siteId || !newRule.siteId) await globalPageRulesCache.clear()
    const updatedRule = await this.raw.findById(args.ruleId)
    response.pageRule = updatedRule
    return response
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

  static applies (r: PageRule, page: Page, pathWithoutSite: string) {
    return this.appliesToPagetree(r, page) && this.appliesToPath(r, pathWithoutSite)
  }

  static appliesToPagetree (r: PageRule, page: Page) {
    return (!r.siteId || r.siteId === page.siteId) && (!r.pagetreeType || r.pagetreeType === page.pagetreeType)
  }

  static appliesToPath (rule: PageRule, pagePathWithoutSite: string) {
    if (rule.mode === RulePathMode.SELF) return rule.path === pagePathWithoutSite
    if (rule.mode === RulePathMode.SELFANDSUB) return pagePathWithoutSite.startsWith(rule.path)
    return rule.path !== pagePathWithoutSite && pagePathWithoutSite.startsWith(rule.path)
  }

  static appliesToChildOfPath (rule: PageRule, pagePathWithoutSite: string) {
    if (rule.path.startsWith(pagePathWithoutSite + (pagePathWithoutSite === '/' ? '' : '/'))) return true
    if (rule.mode === RulePathMode.SELFANDSUB && rule.path === pagePathWithoutSite) return true
    return false
  }

  static appliesToParentOfPath (rule: PageRule, pagePathWithoutSite: string) {
    return this.appliesToPath(rule, popPath(pagePathWithoutSite))
  }

  mayView (rule: PageRule) {
    // rules can only be viewed underneath roles, so the role's mayView function can be relied upon here
    return true
  }

  async mayWrite (rule: PageRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return this.svc(RoleService).mayUpdate(role!)
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

  tooPowerful (rule: PageRule) {
    return tooPowerfulHelper(rule, this.ctx.authInfo.pageRules, this.asOrMorePowerful)
  }
}
