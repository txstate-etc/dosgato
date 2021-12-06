import { AuthorizedService } from '@txstate-mws/graphql-server'
import { filterAsync } from 'txstate-utils'
import { Page } from '../page'
import { PageRuleService, PageRuleGrants } from '../pagerule'
import { RoleService } from '../role'
import { Site } from '../site'
import { SiteRuleGrants, SiteRuleService } from '../siterule'
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
}
