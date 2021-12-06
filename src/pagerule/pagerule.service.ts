import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { RulePathMode } from '.'
import { Page, PageService } from '../page'
import { PagetreeService } from '../pagetree'
import { SiteService } from '../site'
import { getPageRules } from './pagerule.database'
import { PageRule } from './pagerule.model'

const pageRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getPageRules(roleIds)
  },
  extractKey: (r: PageRule) => r.roleId
})

export class PageRuleService extends AuthorizedService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(pageRulesByRoleLoader).load(roleId)
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
}
