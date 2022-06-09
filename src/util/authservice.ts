import { AuthorizedService, Context } from '@txstate-mws/graphql-server'
import { FastifyRequest, FastifyLoggerInstance } from 'fastify'
import { RouteGenericInterface } from 'fastify/types/route'
import { Server, IncomingMessage } from 'http'
import { filterAsync, keyby } from 'txstate-utils'
import {
  Asset, AssetFolder, Data, DataFolder, Page, Site, Template,
  AssetRuleService, AssetRuleGrants, DataRuleService, DataRuleGrants, GlobalRuleService,
  GlobalRuleGrants, PageRuleService, PageRuleGrants, SiteRuleGrants, SiteRuleService,
  TemplateRuleService, TemplateRuleGrants, RoleServiceInternal,
  SiteRuleServiceInternal, PageRuleServiceInternal, AssetRuleServiceInternal, DataRuleServiceInternal,
  GlobalRuleServiceInternal, GroupServiceInternal, UserServiceInternal, TemplateRuleServiceInternal, SiteService, DataRoot, Group
} from '../internal.js'

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
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(GlobalRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    const rules = await this.currentGlobalRules()
    const globalRuleService = this.svc(GlobalRuleService)
    const applicable = await filterAsync(rules, async r => await globalRuleService.applies(r))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentSiteRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(SiteRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async haveSitePerm (site: Site, grant: keyof SiteRuleGrants) {
    const rules = await this.currentSiteRules()
    const siteRuleService = this.svc(SiteRuleService)
    const applicable = await filterAsync(rules, async r => await siteRuleService.applies(r, site))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentPageRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(PageRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async havePagePerm (page: Page, grant: keyof PageRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true
    const rules = await this.currentPageRules()
    const pageRuleService = this.svc(PageRuleService)
    const applicable = await filterAsync(rules, async r => await pageRuleService.applies(r, page))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentAssetRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(AssetRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async haveAssetPerm (asset: Asset, grant: keyof AssetRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true
    const rules = await this.currentAssetRules()
    const assetRuleService = this.svc(AssetRuleService)
    const applicable = await filterAsync(rules, async r => await assetRuleService.applies(r, asset))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveAssetFolderPerm (folder: AssetFolder, grant: keyof AssetRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true
    const rules = await this.currentAssetRules()
    const assetRuleService = this.svc(AssetRuleService)
    const applicable = await filterAsync(rules, async r => await assetRuleService.appliesToFolder(r, folder))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentDataRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(DataRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async haveDataPerm (item: Data, grant: keyof DataRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true

    // if siteId is null it's global data and governed by GlobalRules.manageGlobalData instead
    // of DataRules
    if (!item.siteId) return await this.haveGlobalPerm('manageGlobalData')

    const rules = await this.currentDataRules()
    const dataRuleService = this.svc(DataRuleService)
    const applicable = await filterAsync(rules, async r => await dataRuleService.applies(r, item))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveDataFolderPerm (folder: DataFolder, grant: keyof DataRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true

    if (!folder.siteId) return await this.haveGlobalPerm('manageGlobalData')

    const rules = await this.currentDataRules()
    const dataRuleService = this.svc(DataRuleService)
    const applicable = await filterAsync(rules, async r => await dataRuleService.appliesToFolder(r, folder))
    return applicable.some(r => r.grants[grant])
  }

  protected async haveDataRootPerm (dataroot: DataRoot, grant: keyof DataRuleGrants) {
    if (this.isRenderServer() && grant === 'view') return true
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
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(TemplateRuleServiceInternal).findByRoleId(r.id)))).flat()
  }

  protected async haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    const rules = await this.currentTemplateRules()
    const templateRuleService = this.svc(TemplateRuleService)
    const applicable = await filterAsync(rules, async r => await templateRuleService.applies(r, template))
    return applicable.some(r => r.grants[grant])
  }
}

export class DGContext extends Context {
  async authFromReq (req?: FastifyRequest<RouteGenericInterface, Server, IncomingMessage, unknown, FastifyLoggerInstance>) {
    const token = this.tokenFromReq(req)
    if (token === process.env.DOS_GATO_ANON_TOKEN) {
      return {
        sub: 'anonymous'
      }
    }
    return await super.authFromReq(req)
  }
}
