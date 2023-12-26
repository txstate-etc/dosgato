import { AuthError, AuthorizedService, MockContext, type Context } from '@txstate-mws/graphql-server'
import { Cache, keyby } from 'txstate-utils'
import {
  type Asset, type AssetFolder, type Data, type DataFolder, type Page, type Site, type Template,
  AssetRuleService, type AssetRuleGrants, DataRuleService, type DataRuleGrants, type GlobalRuleGrants,
  PageRuleService, type PageRuleGrants, type SiteRuleGrants, SiteRuleService, TemplateRuleService,
  type TemplateRuleGrants, RoleServiceInternal, SiteRuleServiceInternal, PageRuleServiceInternal,
  AssetRuleServiceInternal, DataRuleServiceInternal, GlobalRuleServiceInternal, GroupServiceInternal,
  UserServiceInternal, TemplateRuleServiceInternal, type DataRoot, type Group, PageServiceInternal,
  shiftPath, PageRule, RulePathMode, DataRule, SiteRule, AssetServiceInternal, AssetFolderServiceInternal,
  DataServiceInternal, DataFolderServiceInternal, type GlobalRule, AssetRule, UserService, type Role
} from '../internal.js'

const pageRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous') return [new PageRule({ path: '/', mode: RulePathMode.SELFANDSUB })]
  if (netid === 'render') return [new PageRule({ path: '/', mode: RulePathMode.SELFANDSUB, viewlatest: true })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(PageRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const assetRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'render') return [new AssetRule({ path: '/', mode: RulePathMode.SELFANDSUB })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(AssetRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const siteRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous' || netid === 'render') return [new SiteRule({})]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(SiteRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const dataRuleCache = new Cache(async (netid: string, ctx: Context) => {
  if (netid === 'anonymous') return [new DataRule({ path: '/' })]
  if (netid === 'render') return [new DataRule({ path: '/', viewlatest: true })]
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(DataRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const globalRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await roleCache.get(netid, ctx)
  const rules = (await Promise.all(roles.map(async r => await ctx.svc(GlobalRuleServiceInternal).findByRoleId(r.id)))).flat()
  const grants: Record<keyof GlobalRule['grants'], boolean> = {
    manageAccess: false,
    manageGlobalData: false,
    manageParentRoles: false,
    manageTemplates: false,
    createSites: false
  }
  for (const r of rules) {
    grants.manageAccess ||= r.grants.manageAccess
    grants.manageGlobalData ||= r.grants.manageGlobalData
    grants.manageParentRoles ||= r.grants.manageParentRoles
    grants.manageTemplates ||= r.grants.manageTemplates
    grants.createSites ||= r.grants.createSites
  }
  return grants
}, { freshseconds: 5, staleseconds: 30 })

const templateRuleCache = new Cache(async (netid: string, ctx: Context) => {
  const roles = await roleCache.get(netid, ctx)
  return (await Promise.all(roles.map(async r => await ctx.svc(TemplateRuleServiceInternal).findByRoleId(r.id)))).flat()
}, { freshseconds: 5, staleseconds: 30 })

const roleCache = new Cache(async (netid: string, ctx: Context) => {
  return await ctx.svc(RoleServiceInternal).findByUserId(netid)
}, { freshseconds: 5, staleseconds: 10 })

export abstract class DosGatoService<ObjType, RedactedType = ObjType> extends AuthorizedService<{ sub?: string, client_id?: string }, ObjType, RedactedType> {
  protected currentRoles!: Role[]

  get login () {
    return this.auth?.sub ?? this.auth?.client_id ?? 'anonymous'
  }

  async currentUser () {
    if (['render', 'anonymous'].includes(this.login)) return undefined
    return await this.svc(UserServiceInternal).findById(this.login)
  }

  async loadRoles () {
    this.currentRoles = await roleCache.get(this.login, this.ctx)
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

  protected async currentGlobalGrants () {
    return await globalRuleCache.get(this.login, this.ctx)
  }

  protected async haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    const grants = await globalRuleCache.get(this.login, this.ctx)
    return grants[grant]
  }

  protected async currentSiteRules () {
    return await siteRuleCache.get(this.login, this.ctx)
  }

  protected async haveSitePerm (site: Site, grant: keyof SiteRuleGrants) {
    const rules = await this.currentSiteRules()
    for (const r of rules) {
      if (r.grants[grant] && SiteRuleService.applies(r, site.id)) return true
    }
    return false
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
    for (const r of rules) {
      if (r.grants[grant] && PageRuleService.applies(r, page, pagePathWithoutSite)) return true
    }
    return false
  }

  protected async currentAssetRules () {
    return await assetRuleCache.get(this.login, this.ctx)
  }

  protected async haveAssetPerm (asset: Asset, grant: keyof AssetRuleGrants) {
    const [rules, assetPath] = await Promise.all([
      this.currentAssetRules(),
      this.svc(AssetServiceInternal).getPath(asset)
    ])
    const assetPathWithoutSite = shiftPath(assetPath)
    for (const r of rules) {
      if (r.grants[grant] && AssetRuleService.applies(r, asset, assetPathWithoutSite)) return true
    }
    return false
  }

  protected async haveAssetFolderPerm (folder: AssetFolder, grant: keyof AssetRuleGrants) {
    const [rules, folderPath] = await Promise.all([
      this.currentAssetRules(),
      this.svc(AssetFolderServiceInternal).getPath(folder)
    ])
    const folderPathWithoutSite = shiftPath(folderPath)
    for (const r of rules) {
      if (r.grants[grant] && AssetRuleService.applies(r, folder, folderPathWithoutSite)) return true
    }
    return false
  }

  protected async currentDataRules () {
    return await dataRuleCache.get(this.login, this.ctx)
  }

  protected async haveDataPerm (item: Data, grant: keyof DataRuleGrants) {
    const [rules, dataPath] = await Promise.all([
      this.currentDataRules(),
      this.svc(DataServiceInternal).getPath(item)
    ])
    const dataPathWithoutSite = shiftPath(dataPath)
    for (const r of rules) {
      if (r.grants[grant] && DataRuleService.applies(r, item, dataPathWithoutSite)) return true
    }
    return false
  }

  protected async haveDataFolderPerm (folder: DataFolder, grant: keyof DataRuleGrants) {
    const [rules, folderPath] = await Promise.all([
      this.currentDataRules(),
      this.svc(DataFolderServiceInternal).getPath(folder)
    ])
    const folderPathWithoutSite = shiftPath(folderPath)
    for (const r of rules) {
      if (r.grants[grant] && DataRuleService.applies(r, folder, folderPathWithoutSite)) return true
    }
    return false
  }

  protected async haveDataRootPerm (dataroot: DataRoot, grant: keyof DataRuleGrants) {
    const rules = await this.currentDataRules()
    return rules.some(r => {
      if (r.path !== '/') return false
      if (!r.grants[grant]) return false
      if (r.global && dataroot.site) return false
      if (r.siteId && (r.siteId !== dataroot.site?.id)) return false
      if (r.templateId && (r.templateId !== dataroot.template.id)) return false
      return true
    })
  }

  protected async currentTemplateRules () {
    return await templateRuleCache.get(this.login, this.ctx)
  }

  protected async haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    const rules = await this.currentTemplateRules()
    const applicable = rules.filter(r => TemplateRuleService.applies(r, template))
    return applicable.some(r => r.grants[grant])
  }
}

export async function getEnabledUser (ctx: Context) {
  await ctx.waitForAuth()
  const user = await ctx.svc(UserService).currentUser()
  if (!user || user.disabled) throw new AuthError()
  return user
}

export function systemContext () {
  return new MockContext({ sub: 'system' }) as Context
}
