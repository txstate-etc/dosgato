import { AuthError, AuthorizedService, type Context } from '@txstate-mws/graphql-server'
import { Cache, filterAsync, keyby } from 'txstate-utils'
import {
  type Asset, type AssetFolder, type Data, type DataFolder, type Page, type Site, type Template,
  AssetRuleService, type AssetRuleGrants, DataRuleService, type DataRuleGrants, GlobalRuleService,
  type GlobalRuleGrants, PageRuleService, type PageRuleGrants, type SiteRuleGrants, SiteRuleService,
  TemplateRuleService, type TemplateRuleGrants, RoleServiceInternal, SiteRuleServiceInternal,
  PageRuleServiceInternal, AssetRuleServiceInternal, DataRuleServiceInternal, GlobalRuleServiceInternal,
  GroupServiceInternal, UserServiceInternal, TemplateRuleServiceInternal, type DataRoot, type Group
} from '../internal.js'

const pageRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(PageRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const assetRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(AssetRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const siteRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(SiteRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const dataRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(DataRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const globalRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(GlobalRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const templateRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(netid)
  return (await Promise.all(roles.map(async r => await ctx.svc(TemplateRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

export abstract class DosGatoService<ObjType, RedactedType = ObjType> extends AuthorizedService<{ sub: string }, ObjType, RedactedType> {
  protected get login () {
    return this.auth!.sub
  }

  protected isRenderServer () {
    return this.login === 'anonymous'
  }

  protected async currentUser () {
    return await this.svc(UserServiceInternal).findById(this.login)
  }

  protected async currentRoles () {
    return await this.svc(RoleServiceInternal).findByUserId(this.login)
  }

  protected async currentGroups () {
    return await this.svc(GroupServiceInternal).findByUserId(this.login)
  }

  protected currentGroupsByIdStorage?: Record<string, Group>
  protected async currentGroupsById (id: string) {
    this.currentGroupsByIdStorage ??= keyby(await this.currentGroups(), 'id')
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
    const applicable = await filterAsync(rules, async r => await siteRuleService.applies(r, site))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentPageRules () {
    return await pageRuleCache.get(this.login, this.ctx)
  }

  protected async havePagePerm (page: Page, grant: keyof PageRuleGrants) {
    const rules = await this.currentPageRules()
    const pageRuleService = this.svc(PageRuleService)
    const applicable = await filterAsync(rules, async r => await pageRuleService.applies(r, page))
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
