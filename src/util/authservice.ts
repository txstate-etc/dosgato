/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { AuthorizedService } from '@txstate-mws/graphql-server'
import { filterAsync } from 'txstate-utils'
import { Asset } from '../asset'
import { AssetFolder } from '../assetfolder'
import { Data } from '../data'
import { Page } from '../page'
import { RoleService } from '../role'
import { Site } from '../site'
import { Template } from '../template'
import { UserService } from '../user'

export abstract class DosGatoService extends AuthorizedService<{ login: string }> {
  protected isRenderServer () {
    return this.auth?.login === 'anonymous'
  }

  protected async currentUser () {
    if (!this.auth?.login) return undefined
    return await this.svc(UserService).findById(this.auth.login)
  }

  protected async currentRoles () {
    if (!this.auth?.login) return []
    return await this.svc(RoleService).findByUserId(this.auth.login)
  }

  protected async currentGlobalRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(GlobalRuleService).findByRoleId(r.id)))).flat()
  }

  protected async haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    const rules = await this.currentGlobalRules()
    const globalRuleService = this.svc(GlobalRuleService)
    const applicable = await filterAsync(rules, async r => await globalRuleService.applies(r))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentSiteRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(SiteRuleService).findByRoleId(r.id)))).flat()
  }

  protected async haveSitePerm (site: Site, grant: keyof SiteRuleGrants) {
    const rules = await this.currentSiteRules()
    const siteRuleService = this.svc(SiteRuleService)
    const applicable = await filterAsync(rules, async r => await siteRuleService.applies(r, site))
    return applicable.some(r => r.grants[grant])
  }

  protected async currentPageRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(PageRuleService).findByRoleId(r.id)))).flat()
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
    return (await Promise.all(roles.map(async r => await this.svc(AssetRuleService).findByRoleId(r.id)))).flat()
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
    return (await Promise.all(roles.map(async r => await this.svc(DataRuleService).findByRoleId(r.id)))).flat()
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

  protected async currentTemplateRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(TemplateRuleService).findByRoleId(r.id)))).flat()
  }

  protected async haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    const rules = await this.currentTemplateRules()
    const templateRuleService = this.svc(TemplateRuleService)
    const applicable = await filterAsync(rules, async r => await templateRuleService.applies(r, template))
    return applicable.some(r => r.grants[grant])
  }
}

import { AssetRuleService, AssetRuleGrants } from '../assetrule'
import { DataRuleService, DataRuleGrants } from '../datarule'
import { GlobalRuleService, GlobalRuleGrants } from '../globalrule'
import { PageRuleService, PageRuleGrants } from '../pagerule'
import { SiteRuleGrants, SiteRuleService } from '../siterule'
import { TemplateRuleService, TemplateRuleGrants } from '../templaterule'
