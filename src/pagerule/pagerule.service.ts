import { BaseService, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Cache, filterAsync, isNotNull } from 'txstate-utils'
import {
  type Page, type PageRuleFilter, DosGatoService, comparePathsWithMode, tooPowerfulHelper, getPageRules,
  PageRule, RulePathMode, SiteService, type CreatePageRuleInput, RoleService, createPageRule, PageRuleResponse,
  type UpdatePageRuleInput, updatePageRule, deletePageRule, RoleServiceInternal, PagetreeServiceInternal,
  PageServiceInternal, type Pagetree, type PagetreeType
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

  async create (args: CreatePageRuleInput, validateOnly?: boolean) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new PageRule({ id: '0', path: args.path ?? '/', roleId: args.roleId, siteId: args.siteId, pagetreeType: args.pagetreeType, mode: args.mode ?? RulePathMode.SELFANDSUB, ...args.grants })
    const response = new PageRuleResponse({ success: true })
    const rules = await this.findByRoleId(args.roleId)
    if (rules.some((r: PageRule) => {
      if (r.siteId !== args.siteId) return false
      if (!args.path) {
        return r.path === '/'
      } else return r.path === args.path
    })) {
      response.addMessage('The proposed rule has the same site and path as an existing rule for this role.', undefined, MutationMessageType.error)
    }
    if (await this.tooPowerful(newRule)) {
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
    if (await this.tooPowerful(newRule)) response.addMessage('The updated rule would have more privilege than you currently have, so you cannot create it.')
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

  async applies (rule: PageRule, page: Page) {
    const [pagetree, pagePath] = await Promise.all([
      this.svc(PagetreeServiceInternal).findById(page.pagetreeId),
      this.svc(PageServiceInternal).getPath(page)
    ])
    if (!pagetree) return false
    return this.appliesSync(rule, page, pagetree.type, pagePath)
  }

  appliesSync (rule: PageRule, page: Page, pagetreeType: PagetreeType, pagePath: string) {
    if (rule.siteId && rule.siteId !== String(page.siteInternalId)) return false
    if (rule.pagetreeType && rule.pagetreeType !== pagetreeType) return false
    const pagePathWithoutSite = '/' + pagePath.split('/').slice(2).join('/')
    if (rule.mode === RulePathMode.SELF && rule.path !== pagePathWithoutSite) return false
    if (rule.mode === RulePathMode.SELFANDSUB && !pagePathWithoutSite.startsWith(rule.path)) return false
    if (rule.mode === RulePathMode.SUB && (rule.path === pagePathWithoutSite || !pagePathWithoutSite.startsWith(rule.path))) return false
    return true
  }

  async appliesToChild (rule: PageRule, page: Page, pagetree?: Pagetree, pagePath?: string) {
    const [fetchedPagetree, fetchedPagePath] = await Promise.all([
      pagetree ?? this.svc(PagetreeServiceInternal).findById(page.pagetreeId),
      pagePath ?? this.svc(PageServiceInternal).getPath(page)
    ])
    if (!fetchedPagetree || !pagePath) return false
    return this.appliesToChildSync(rule, page, fetchedPagetree.type, pagePath)
  }

  appliesToChildSync (rule: PageRule, page: Page, pagetreeType: PagetreeType, pagePath: string) {
    if (rule.siteId && rule.siteId !== String(page.siteInternalId)) return false
    if (rule.pagetreeType && rule.pagetreeType !== pagetreeType) return false
    const pagePathWithoutSite = '/' + pagePath.split('/').slice(2).join('/')
    if (rule.path.startsWith(pagePathWithoutSite + '/')) return true
    if (rule.mode === RulePathMode.SELFANDSUB && rule.path === pagePathWithoutSite) return true
    return false
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
