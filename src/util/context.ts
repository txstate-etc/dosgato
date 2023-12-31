import { Context, MockContext } from '@txstate-mws/graphql-server'
import {
 AssetRule, DataRule, type GlobalRule, PageRule, RoleServiceInternal, RulePathMode, SiteRule, getPageRules, getAssetRules,
  getDataRules, getSiteRules, getGlobalRules, getTemplateRules, type GlobalRuleGrants, type TemplateRule, type Role, getUsers,
  GroupServiceInternal, type Group, type User
} from '../internal.js'
import { Cache, keyby } from 'txstate-utils'

async function fetchPageRules (netid: string, roleIds: string[]) {
  if (netid === 'anonymous') return [new PageRule({ path: '/', mode: RulePathMode.SELFANDSUB })]
  if (netid === 'render') return [new PageRule({ path: '/', mode: RulePathMode.SELFANDSUB, viewlatest: true })]
  if (roleIds.length === 0) return []
  return await getPageRules({ roleIds })
}

async function fetchAssetRules (netid: string, roleIds: string[]) {
  if (netid === 'anonymous') return []
  if (netid === 'render') return [new AssetRule({ path: '/', mode: RulePathMode.SELFANDSUB })]
  if (roleIds.length === 0) return []
  return await getAssetRules({ roleIds })
}

async function fetchSiteRules (netid: string, roleIds: string[]) {
  if (netid === 'anonymous' || netid === 'render') return [new SiteRule({})]
  if (roleIds.length === 0) return []
  return await getSiteRules({ roleIds })
}

async function fetchDataRules (netid: string, roleIds: string[]) {
  if (netid === 'anonymous') return [new DataRule({ path: '/' })]
  if (netid === 'render') return [new DataRule({ path: '/', viewlatest: true })]
  if (roleIds.length === 0) return []
  return await getDataRules({ roleIds })
}

async function fetchGlobalRules (netid: string, roleIds: string[]) {
  const grants: Record<keyof GlobalRule['grants'], boolean> = {
    manageAccess: false,
    manageGlobalData: false,
    manageParentRoles: false,
    manageTemplates: false,
    createSites: false
  }
  if (roleIds.length === 0) return grants
  const rules = await getGlobalRules({ roleIds })
  for (const r of rules) {
    grants.manageAccess ||= r.grants.manageAccess
    grants.manageGlobalData ||= r.grants.manageGlobalData
    grants.manageParentRoles ||= r.grants.manageParentRoles
    grants.manageTemplates ||= r.grants.manageTemplates
    grants.createSites ||= r.grants.createSites
  }
  return grants
}

async function fetchTemplateRules (netid: string, roleIds: string[]) {
  if (roleIds.length === 0) return []
  return await getTemplateRules({ roleIds })
}

async function fetchUser (login: string) {
  if (['render', 'anonymous'].includes(login)) return undefined
  return (await getUsers({ ids: [login] }))[0]
}

async function fetchGroups (login: string, ctx: DGContext | DGMockContext) {
  const groups = await ctx.svc(GroupServiceInternal).findByUserId(login)
  return keyby(groups, 'id')
}

const authCache = new Cache(async (login: string, ctx: DGContext | DGMockContext) => {
  const roles = await ctx.svc(RoleServiceInternal).findByUserId(login)
  const roleIds = roles.map(r => r.id)
  const [pageRules, assetRules, siteRules, dataRules, globalGrants, templateRules, groupsById, user] = await Promise.all([
    fetchPageRules(login, roleIds),
    fetchAssetRules(login, roleIds),
    fetchSiteRules(login, roleIds),
    fetchDataRules(login, roleIds),
    fetchGlobalRules(login, roleIds),
    fetchTemplateRules(login, roleIds),
    fetchGroups(login, ctx),
    fetchUser(login)
  ])
  return { roles, pageRules, assetRules, siteRules, dataRules, globalGrants, templateRules, groupsById, user } as AuthInfo
})

interface AuthInfo {
  roles: Role[]
  pageRules: PageRule[]
  assetRules: AssetRule[]
  siteRules: SiteRule[]
  dataRules: DataRule[]
  globalGrants: Record<keyof GlobalRuleGrants, boolean>
  templateRules: TemplateRule[]
  groupsById: Record<string, Group>
  user: User | undefined
}

export class DGMockContext extends MockContext {
  authInfo!: AuthInfo
  get login () {
    return this.auth?.sub ?? this.auth?.client_id ?? 'anonymous'
  }

  async waitForAuth () {
    await super.waitForAuth()
    this.authInfo = await authCache.get(this.login, this)
  }
}

export class DGContext extends Context {
  authInfo!: AuthInfo
  get login () {
    return this.auth?.sub ?? this.auth?.client_id ?? 'anonymous'
  }

  async waitForAuth () {
    await super.waitForAuth()
    this.authInfo = await authCache.get(this.login, this)
  }
}
