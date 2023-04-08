import { AuthError, AuthorizedService, type Context } from '@txstate-mws/graphql-server'
import { Cache, filterAsync, keyby } from 'txstate-utils'
import {
  type Asset, type AssetFolder, type Data, type DataFolder, type Page, type Site, type Template,
  AssetRuleService, type AssetRuleGrants, DataRuleService, DataRuleGrants, GlobalRuleService,
  type GlobalRuleGrants, PageRuleService, PageRuleGrants, SiteRuleGrants, SiteRuleService,
  TemplateRuleService, type TemplateRuleGrants, RoleServiceInternal, SiteRuleServiceInternal,
  PageRuleServiceInternal, AssetRuleServiceInternal, DataRuleServiceInternal, GlobalRuleServiceInternal,
  GroupServiceInternal, UserServiceInternal, TemplateRuleServiceInternal, type DataRoot, type Group,
  PageServiceInternal, shiftPath, PageRule, RulePathMode, DataRule, SiteRule
} from '../internal.js'

const pageRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous') return [new PageRule({ path: '/', mode: RulePathMode.SELFANDSUB, grants: new PageRuleGrants({}) })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(PageRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const assetRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(AssetRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const siteRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous') return [new SiteRule({ grants: new SiteRuleGrants({}) })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(SiteRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const dataRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous') return [new DataRule({ path: '/', grants: new DataRuleGrants({}) })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(DataRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const globalRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(GlobalRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const templateRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(TemplateRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const roleCache = new Cache(async (netid: string, ctx: Context) => {
  return await ctx.svc(RoleServiceInternal).findByUserId(netid)
}, { freshseconds: 5, staleseconds: 10 })

export abstract class DosGatoService<ObjType, RedactedType = ObjType> extends AuthorizedService<{ sub: string }, ObjType, RedactedType> {
  protected get login () {
    return this.auth!.sub
  }

  protected async currentUser () {
    return await this.svc(UserServiceInternal).findById(this.login)
  }

  protected async currentRoles () {
    return await roleCache.get(this.login, this.ctx)
  }

  protected async currentGroups () {
    return await this.svc(GroupServiceInternal).findByUserId(this.login)
  }

  protected currentGroupsByIdPromise?: Promise<Group[]>
  protected currentGroupsByIdStorage?: Record<string, Group>
  protected async currentGroupsById (id: string) {
    if (!this.currentGroupsByIdStorage) {
      // store the promise in a shared variable to coalesce calls
      this.currentGroupsByIdPromise ??= this.currentGroups()
      const groups = await this.currentGroupsByIdPromise
      this.currentGroupsByIdStorage ??= keyby(groups, 'id')
    }
    return this.currentGroupsByIdStorage[id]
  }

  protected async currentGlobalRules () {
    return await globalRuleCache.get(this.login, this.ctx)
  }

  protected async haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    const rules = await this.currentGlobalRules()
    const globalRuleService = this.svc(GlobalRuleService)
    const applicable = await filterAsync(rules, async r => await globalRuleService.applies(r))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentSiteRules () {
    return await siteRuleCache.get(this.login, this.ctx)
  }

  protected async haveSitePerm (site: Site, grant: keyof SiteRuleGrants) {
    const rules = await this.currentSiteRules()
    const siteRuleService = this.svc(SiteRuleService)
    const applicable = rules.filter(r => siteRuleService.applies(r, site.id))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentPageRules () {
    return await pageRuleCache.get(this.login, this.ctx)
  }

  protected async havePagePerm (page: Page, grant: keyof PageRuleGrants) {
    const [rules, pagePath] = await Promise.all([
      this.currentPageRules(),
      this.svc(PageServiceInternal).getPath(page)
    ])
    const pagePathWithoutSite = shiftPath(pagePath)
    const applicable = rules.filter(r => PageRuleService.appliesToPagetree(r, page) && PageRuleService.appliesToPath(r, pagePathWithoutSite))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentAssetRules () {
    return await assetRuleCache.get(this.login, this.ctx)
  }

  protected async haveAssetPerm (asset: Asset, grant: keyof AssetRuleGrants) {
    const rules = await this.currentAssetRules()
    const assetRuleService = this.svc(AssetRuleService)
    const applicable = await filterAsync(rules, async r => await assetRuleService.applies(r, asset))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveAssetFolderPerm (folder: AssetFolder, grant: keyof AssetRuleGrants) {
    const rules = await this.currentAssetRules()
    const assetRuleService = this.svc(AssetRuleService)
    const applicable = await filterAsync(rules, async r => await assetRuleService.appliesToFolder(r, folder))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentDataRules () {
    return await dataRuleCache.get(this.login, this.ctx)
  }

  protected async haveDataPerm (item: Data, grant: keyof DataRuleGrants) {
    // if siteId is null it's global data and governed by GlobalRules.manageGlobalData instead
    // of DataRules
    if (!item.siteId) return await this.haveGlobalPerm('manageGlobalData')

    const rules = await this.currentDataRules()
    const dataRuleService = this.svc(DataRuleService)
    const applicable = await filterAsync(rules, async r => await dataRuleService.applies(r, item))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveDataFolderPerm (folder: DataFolder, grant: keyof DataRuleGrants) {
    if (!folder.siteId) return await this.haveGlobalPerm('manageGlobalData')

    const rules = await this.currentDataRules()
    const dataRuleService = this.svc(DataRuleService)
    const applicable = await filterAsync(rules, async r => await dataRuleService.appliesToFolder(r, folder))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveDataRootPerm (dataroot: DataRoot, grant: keyof DataRuleGrants) {
    if (!dataroot.site) return await this.haveGlobalPerm('manageGlobalData')
    const rules = await this.currentDataRules()
    return rules.some(r => {
      if (r.path !== '/') return false
      if (!r.grants[grant]) return false
      if (r.siteId && (r.siteId !== dataroot.site!.id)) return false
      if (r.templateId && (r.templateId !== dataroot.template.id)) return false
      return true
    })
  }

  protected async currentTemplateRules () {
    return await templateRuleCache.get(this.login, this.ctx)
  }

  protected async haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    const rules = await this.currentTemplateRules()
    const templateRuleService = this.svc(TemplateRuleService)
    const applicable = await filterAsync(rules, async r => await templateRuleService.applies(r, template))
    return applicable.some(r => r.grants[grant])
  }
}

export async function getEnabledUser (ctx: Context) {
  await ctx.waitForAuth()
  if (!ctx.auth?.sub) throw new AuthError()
  const user = await ctx.svc(UserServiceInternal).findById(ctx.auth.sub)
  if (!user || user.disabled) throw new AuthError()
  return user
}
