import { MockContext, type Context } from '@txstate-mws/graphql-server'
import type { FastifyRequest } from 'fastify'
import {
 AssetRule, DataRule, type GlobalRule, PageRule, RoleServiceInternal, RulePathMode, SiteRule, getPageRules, getAssetRules,
  getDataRules, getSiteRules, getGlobalRules, getTemplateRules, type GlobalRuleGrants, type TemplateRule, type Role, getUsers,
  GroupServiceInternal, type Group, type User, SiteServiceInternal,
  systemContext
} from '../internal.js'
import { Cache, isNotNull, keyby, unique } from 'txstate-utils'

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

async function fetchGroups (login: string, ctx: DGContext) {
  const groups = await ctx.svc(GroupServiceInternal).findByUserId(login)
  return keyby(groups, 'id')
}

async function fetchSitesOwnedOrManaged (userInternalId: number, ctx: DGContext) {
  const [sitesOwned, sitesManaged] = await Promise.all([
    ctx.svc(SiteServiceInternal).findByOwnerInternalId(userInternalId),
    ctx.svc(SiteServiceInternal).findByManagerInternalId(userInternalId)
  ])
  return unique([...sitesOwned, ...sitesManaged].map(s => s.id))
}

const authCache = new Cache(async (login: string, ctx: DGContext) => {
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
  if ((!user || user.disabled) && !['anonymous', 'render'].includes(login)) return { roles: [], pageRules: [], assetRules: [], siteRules: [], dataRules: [], globalGrants: { manageAccess: false, manageParentRoles: false, createSites: false, manageGlobalData: false, manageTemplates: false }, templateRules: [], groupsById: {}, user, pageSiteIds: [], ownedOrManagedSiteIds: [] }
  const pageSiteIds = pageRules.some(r => r.grants.viewForEdit && r.siteId == null) ? undefined : pageRules.map(r => r.siteId).filter(isNotNull)
  const ownedOrManagedSiteIds = user ? await fetchSitesOwnedOrManaged(user.internalId, ctx) : []
  return { roles, pageRules, assetRules, siteRules, dataRules, globalGrants, templateRules, groupsById, user, pageSiteIds, ownedOrManagedSiteIds } as AuthInfo
}, { freshseconds: 30 })

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
  pageSiteIds?: string[]
  ownedOrManagedSiteIds?: string[]
}

export interface DGContext extends Context {
  authInfo: AuthInfo
  login: string
  systemCtx: DGContext

  prefetch: () => Promise<void>
}

export type DGContextClass = typeof Context & (new (req: FastifyRequest) => DGContext)
export type DGMockContextClass = typeof Context & (new (claims: any) => DGContext)

export function dgContextMixin (Ctx: typeof Context): DGContextClass {
  return class extends Ctx {
    authInfo!: AuthInfo
    systemCtx!: DGContext
    get login () {
      return this.auth?.username ?? this.auth?.clientId ?? 'anonymous'
    }

    async prefetch () {
      await super.prefetch()
      const systemCtxPromise = this.login === 'system' ? undefined : systemContext()
      this.authInfo = await authCache.get(this.login, this)
      this.systemCtx = systemCtxPromise ? await systemCtxPromise : this
    }
  } as unknown as DGContextClass
}

export const DGMockContext = dgContextMixin(MockContext as any) as DGMockContextClass
