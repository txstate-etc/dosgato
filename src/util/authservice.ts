import { AuthorizedService } from '@txstate-mws/graphql-server'
import { filterAsync } from 'txstate-utils'
import { Asset } from '../asset'
import { AssetRuleService, AssetRuleGrants } from '../assetrule'
import { GlobalRuleService, GlobalRuleGrants } from '../globalrule'
import { Page } from '../page'
import { PageRuleService, PageRuleGrants } from '../pagerule'
import { RoleService } from '../role'
import { Site } from '../site'
import { SiteRuleGrants, SiteRuleService } from '../siterule'
import { Template } from '../template'
import { TemplateRuleService, TemplateRuleGrants } from '../templaterule'
import { UserService } from '../user'

export abstract class DosGatoService extends AuthorizedService<{ login: string }> {
  async currentUser () {
    if (!this.auth?.login) return undefined
    return await this.svc(UserService).findById(this.auth.login)
  }

  async currentRoles () {
    if (!this.auth?.login) return []
    return await this.svc(RoleService).findByUserId(this.auth.login)
  }

  async currentGlobalRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(GlobalRuleService).findByRoleId(r.id)))).flat()
  }

  async haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    const rules = await this.currentGlobalRules()
    const globalRuleService = this.svc(GlobalRuleService)
    const applicable = await filterAsync(rules, async r => await globalRuleService.applies(r))
    return applicable.some(r => r.grants[grant])
  }

  async currentSiteRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(SiteRuleService).findByRoleId(r.id)))).flat()
  }

  async haveSitePerm (site: Site, grant: keyof SiteRuleGrants) {
    const rules = await this.currentSiteRules()
    const siteRuleService = this.svc(SiteRuleService)
    const applicable = await filterAsync(rules, async r => await siteRuleService.applies(r, site))
    return applicable.some(r => r.grants[grant])
  }

  async currentPageRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(PageRuleService).findByRoleId(r.id)))).flat()
  }

  async havePagePerm (page: Page, grant: keyof PageRuleGrants) {
    const rules = await this.currentPageRules()
    const pageRuleService = this.svc(PageRuleService)
    const applicable = await filterAsync(rules, async r => await pageRuleService.applies(r, page))
    return applicable.some(r => r.grants[grant])
  }

  async currentAssetRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(AssetRuleService).findByRoleId(r.id)))).flat()
  }

  async haveAssetPerm (asset: Asset, grant: keyof AssetRuleGrants) {
    const rules = await this.currentAssetRules()
    const assetRuleService = this.svc(AssetRuleService)
    const applicable = await filterAsync(rules, async r => await assetRuleService.applies(r, asset))
    return applicable.some(r => r.grants[grant])
  }

  async currentTemplateRules () {
    const roles = await this.currentRoles()
    return (await Promise.all(roles.map(async r => await this.svc(TemplateRuleService).findByRoleId(r.id)))).flat()
  }

  async haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    const rules = await this.currentTemplateRules()
    const templateRuleService = this.svc(TemplateRuleService)
    const applicable = await filterAsync(rules, async r => await templateRuleService.applies(r, template))
    return applicable.some(r => r.grants[grant])
  }
}
