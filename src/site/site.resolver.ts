import { PageData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { isNotNull, unique } from 'txstate-utils'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import {
  AssetPermission, AssetFolder, AssetFolderService, DataPermission, Organization, OrganizationService,
  Page, PagePermission, PageService, Pagetree, PagetreeFilter, Role, Template, TemplateFilter,
  TemplateService, User, UserService, Site, SiteFilter, SitePermission, SitePermissions,
  SiteResponse, UpdateSiteManagementInput, SiteService, RoleService, DataRoot, DataRootService,
  DataRootFilter, SiteComment, SiteCommentService, JsonData, UrlSafeString, PagetreeServiceInternal,
  RoleFilter, LaunchState, SiteRuleServiceInternal, AssetRuleServiceInternal, DataRuleServiceInternal,
  PageRuleServiceInternal
} from '../internal.js'

@Resolver(of => Site)
export class SiteResolver {
  @Query(returns => [Site])
  async sites (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: SiteFilter) {
    return await ctx.svc(SiteService).find(filter)
  }

  @FieldResolver(returns => [Pagetree])
  async pagetrees (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: PagetreeFilter) {
    // intentionally skip authz for performance - if you can see the site you can see its pagetrees
    return await ctx.svc(PagetreeServiceInternal).findBySiteId(site.id, filter)
  }

  @FieldResolver(returns => Pagetree)
  async primaryPagetree (@Ctx() ctx: Context, @Root() site: Site) {
    // intentionally skip authz for performance - if you can see the site you can see its pagetrees
    return await ctx.svc(PagetreeServiceInternal).findById(site.primaryPagetreeId)
  }

  @FieldResolver(returns => Page)
  async rootPage (@Ctx() ctx: Context, @Root() site: Site) {
    const [page] = await ctx.svc(PageService).findByPagetreeId(site.primaryPagetreeId, { maxDepth: 0 })
    return page
  }

  @FieldResolver(returns => AssetFolder)
  async rootAssetFolder (@Ctx() ctx: Context, @Root() site: Site) {
    const [folder] = await ctx.svc(AssetFolderService).findByPagetreeId(site.primaryPagetreeId, { maxDepth: 0 })
    return folder
  }

  @FieldResolver(returns => [DataRoot], { description: 'Each site has a set of data roots, one for each active data template in the system.' })
  async dataroots (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: DataRootFilter) {
    return await ctx.svc(DataRootService).findBySite(site, filter)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions anywhere on this site, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() site: Site,
    @Arg('filter', type => RoleFilter, { nullable: true }) filter?: RoleFilter,
    @Arg('withSitePermission', type => [SitePermission], { nullable: true }) withSitePermission?: SitePermission[],
    @Arg('withAssetPermission', type => [AssetPermission], { nullable: true }) withAssetPermission?: AssetPermission[],
    @Arg('withDataPermission', type => [DataPermission], { nullable: true }) withDataPermission?: DataPermission[],
    @Arg('withPagePermission', type => [PagePermission], { nullable: true }) withPagePermission?: PagePermission[]
  ) {
    let [siteRules, assetRules, dataRules, pageRules] = await Promise.all([
      ctx.svc(SiteRuleServiceInternal).findBySiteId(site.id),
      ctx.svc(AssetRuleServiceInternal).findBySiteId(site.id),
      ctx.svc(DataRuleServiceInternal).findBySiteId(site.id),
      ctx.svc(PageRuleServiceInternal).findBySiteId(site.id)
    ])
    if (withSitePermission) siteRules = siteRules.filter(r => withSitePermission.some(p => r.grants[p]))
    if (withAssetPermission) assetRules = assetRules.filter(r => withAssetPermission.some(p => r.grants[p]))
    if (withDataPermission) dataRules = dataRules.filter(r => withDataPermission.some(p => r.grants[p]))
    if (withPagePermission) pageRules = pageRules.filter(r => withPagePermission.some(p => r.grants[p]))
    const roleIds = [...siteRules.map(r => r.roleId), ...assetRules.map(r => r.roleId), ...dataRules.map(r => r.roleId), ...pageRules.map(r => r.roleId)]
    return await ctx.svc(RoleService).findByIds(unique(roleIds), filter)
  }

  @FieldResolver(returns => Role, { description: 'Each site has exactly one primary role associated with it. This association gives the site managers authority to assign/unassign that role or any of its subroles to/from any valid user. This is completely different logic from the `Site.roles` property which returns roles based on the permissions granted by the role (see its description for details).' })
  async role (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(RoleService).findBySiteId(site.id)
  }

  @FieldResolver(returns => User, { nullable: true })
  async owner (@Ctx() ctx: Context, @Root() site: Site) {
    if (!ctx.svc(SiteService).mayViewForEdit(site)) return undefined
    if (isNotNull(site.ownerId)) {
      return await ctx.svc(UserService).findByInternalId(site.ownerId)
    }
  }

  @FieldResolver(returns => Organization, { nullable: true })
  async organization (@Ctx() ctx: Context, @Root() site: Site) {
    if (!site.organizationId || !ctx.svc(SiteService).mayViewForEdit(site)) return undefined
    return await ctx.svc(OrganizationService).findById(site.organizationId)
  }

  @FieldResolver(returns => Organization, { nullable: true, description: 'Return an ancestor organization if it exists.' })
  async ancestorOrganization (@Ctx() ctx: Context, @Root() site: Site, @Arg('level', type => Number, { nullable: true, description: '0 for immediate parent, 1 for grandparent, etc. Default is 0.' }) level?: number, @Arg('topDown', { nullable: true, description: 'If true, level 0 is the largest organization and the immediate parent is the last level. Default is false.' }) topDown?: boolean) {
    if (!site.organizationId || !ctx.svc(SiteService).mayViewForEdit(site)) return undefined
    const [org] = await ctx.svc(OrganizationService).findAncestors(site.organizationId, topDown, [level ?? 0])
    return org
  }

  @FieldResolver(returns => [User])
  async managers (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(UserService).findSiteManagers(site.id)
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this site.' })
  async templates (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    return await ctx.svc(TemplateService).findBySiteId(site.id, filter)
  }

  @FieldResolver(returns => Boolean, { description: 'True if the site has been launched (i.e. is available on a specified URL outside the editing host.' })
  async launched (@Ctx() ctx: Context, @Root() site: Site) {
    return site.launchState === LaunchState.LAUNCHED
  }

  @FieldResolver(returns => [SiteComment], { description: 'Returns comments about a site' })
  async comments (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteCommentService).findBySiteId(site.id)
  }

  @FieldResolver(returns => SitePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() site: Site) {
    return site
  }

  // MUTATIONS
  @Mutation(returns => SiteResponse, { description: 'Create a new site with a pagetree, root page, and asset folder' })
  async createSite (@Ctx() ctx: Context,
    @Arg('name', type => UrlSafeString) name: string,
    @Arg('data', type => JsonData, { description: "Page data after the user has saved the page properties dialog for the root page. Data should include templateKey and the admin UI's schemaVersion." }) data: PageData,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean
  ) {
    return await ctx.svc(SiteService).create(name, data, validateOnly)
  }

  @Mutation(returns => SiteResponse, { description: 'Rename a site. This will also rename the site\'s root asset folder and the root page for all of its pagetrees.' })
  async renameSite (@Ctx() ctx: Context,
    @Arg('siteId', type => ID) siteId: string,
    @Arg('name', type => UrlSafeString) name: string,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean
  ) {
    return await ctx.svc(SiteService).rename(siteId, name, validateOnly)
  }

  @Mutation(returns => SiteResponse, { description: 'Set or unset the launch URL for a site. ' })
  async setLaunchURL (@Ctx() ctx: Context,
    @Arg('siteId', type => ID) siteId: string,
    @Arg('host', { nullable: true }) host: string,
    @Arg('path', { nullable: true }) path: string,
    @Arg('enabled', type => LaunchState, { nullable: true, description: 'Default is PRELAUNCH.', defaultValue: LaunchState.PRELAUNCH }) enabled: LaunchState,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean
  ) {
    return await ctx.svc(SiteService).setLaunchURL(siteId, host, path, enabled, validateOnly)
  }

  @Mutation(returns => SiteResponse, { description: 'Update a site\'s organization, owner, and/or managers' })
  async updateSiteManagement (@Ctx() ctx: Context, @Arg('siteId', type => ID) siteId: string, @Arg('args', type => UpdateSiteManagementInput) args: UpdateSiteManagementInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(SiteService).updateSiteManagement(siteId, args, validateOnly)
  }

  @Mutation(returns => SiteResponse)
  async deleteSite (@Ctx() ctx: Context, @Arg('siteId', type => ID) siteId: string, @Arg('hardDelete', { nullable: true, description: 'true if the site should be hard deleted, false for soft deletion' }) hardDelete?: boolean) {
    return await ctx.svc(SiteService).delete(siteId)
  }

  @Mutation(returns => SiteResponse)
  async undeleteSite (@Ctx() ctx: Context, @Arg('siteId', type => ID) siteId: string) {
    return await ctx.svc(SiteService).undelete(siteId)
  }
}

@Resolver(of => SitePermissions)
export class SitePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user should see this site in the site management UI.' })
  viewForEdit (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayViewForEdit(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set or update the public URL for this site.' })
  launch (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayLaunch(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to rename this site.' })
  rename (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayRename(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set owner, managers, and organization and add comments for this site.' })
  manageGovernance (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayManageGovernance(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to create, edit, delete, and undelete pagetrees (such as a sandbox or archive) in this site.' })
  manageState (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayManageState(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to soft-delete this site.' })
  delete (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayDelete(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to un-delete this site. Returns false unless the site is currently soft-deleted.' })
  undelete (@Ctx() ctx: Context, @Root() site: Site) {
    return ctx.svc(SiteService).mayUndelete(site)
  }
}
