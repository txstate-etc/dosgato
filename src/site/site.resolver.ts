import { Context } from '@txstate-mws/graphql-server'
import { isNotNull, unique } from 'txstate-utils'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import {
  AssetPermission, AssetFolder, AssetFolderService, Data, DataFilter, DataPermission, DataService,
  DataFolder, DataFolderFilter, DataFolderService, Organization, OrganizationService,
  Page, PageFilter, PagePermission, PageService, Pagetree, PagetreeFilter,
  PagetreeService, Role, Template, TemplateFilter, TemplateService, User, UserService,
  Site, SiteFilter, CreateSiteInput, SitePermission, SitePermissions, SiteResponse,
  UpdateSiteInput, SiteService, AssetRuleService, PageRuleService, SiteRuleService, DataRuleService,
  RoleService
} from 'internal'

@Resolver(of => Site)
export class SiteResolver {
  @Query(returns => [Site])
  async sites (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: SiteFilter) {
    return await ctx.svc(SiteService).find(filter)
  }

  @FieldResolver(returns => [Pagetree])
  async pagetrees (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: PagetreeFilter) {
    return await ctx.svc(PagetreeService).findBySiteId(site.id, filter)
  }

  @FieldResolver(returns => Page)
  async pageroot (@Ctx() ctx: Context, @Root() site: Site) {
    const filter: PageFilter = { pagetreeIds: [site.primaryPagetreeId], paths: [`/${site.name}`] }
    const pages = await ctx.svc(PageService).find(filter)
    return pages[0]
  }

  @FieldResolver(returns => AssetFolder)
  async assetroot (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(AssetFolderService).findByInternalId(site.rootAssetFolderInternalId)
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    return await ctx.svc(DataService).findBySiteId(site.id, filter)
  }

  @FieldResolver(returns => [DataFolder], { description: 'Data folders that belong to this site. There is no root folder since data folders are single-depth.' })
  async datafolders (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: DataFolderFilter) {
    return await ctx.svc(DataFolderService).findBySiteId(site.id, filter)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions anywhere on this site, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() site: Site,
    @Arg('withSitePermission', type => [SitePermission], { nullable: true }) withSitePermission?: SitePermission[],
    @Arg('withAssetPermission', type => [AssetPermission], { nullable: true }) withAssetPermission?: AssetPermission[],
    @Arg('withDataPermission', type => [DataPermission], { nullable: true }) withDataPermission?: DataPermission[],
    @Arg('withPagePermission', type => [PagePermission], { nullable: true }) withPagePermission?: PagePermission[]
  ) {
    let [siteRules, assetRules, dataRules, pageRules] = await Promise.all([
      ctx.svc(SiteRuleService).findBySiteId(site.id),
      ctx.svc(AssetRuleService).findBySiteId(site.id),
      ctx.svc(DataRuleService).findBySiteId(site.id),
      ctx.svc(PageRuleService).findBySiteId(site.id)
    ])
    if (withSitePermission) siteRules = siteRules.filter(r => withSitePermission.some(p => r.grants[p]))
    if (withAssetPermission) assetRules = assetRules.filter(r => withAssetPermission.some(p => r.grants[p]))
    if (withDataPermission) dataRules = dataRules.filter(r => withDataPermission.some(p => r.grants[p]))
    if (withPagePermission) pageRules = pageRules.filter(r => withPagePermission.some(p => r.grants[p]))
    const ruleIds = [...siteRules.map(r => r.roleId), ...assetRules.map(r => r.roleId), ...dataRules.map(r => r.roleId), ...pageRules.map(r => r.roleId)]
    return await ctx.svc(RoleService).findByIds(unique(ruleIds))
  }

  @FieldResolver(returns => User, { nullable: true })
  async owner (@Ctx() ctx: Context, @Root() site: Site) {
    if (isNotNull(site.ownerId)) {
      return await ctx.svc(UserService).findByInternalId(site.ownerId)
    }
  }

  @FieldResolver(returns => Organization, { nullable: true })
  async organization (@Ctx() ctx: Context, @Root() site: Site) {
    if (isNotNull(site.organizationId)) {
      return await ctx.svc(OrganizationService).findById(String(site.organizationId))
    }
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
    return isNotNull(site.url)
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
  async createSite (@Ctx() ctx: Context, @Arg('args', type => CreateSiteInput) args: CreateSiteInput) {
    return await ctx.svc(SiteService).create(args)
  }

  @Mutation(returns => SiteResponse)
  async updateSite (@Ctx() ctx: Context, @Arg('siteId', type => ID) siteId: string, @Arg('args', type => UpdateSiteInput) args: UpdateSiteInput) {
    return await ctx.svc(SiteService).update(siteId, args)
  }

  @Mutation(returns => SiteResponse)
  async deleteSite (@Ctx() ctx: Context, @Arg('siteId') siteId: string, @Arg('hardDelete', { nullable: true, description: 'true if the site should be hard deleted, false for soft deletion' }) hardDelete?: boolean) {
    return await ctx.svc(SiteService).delete(siteId)
  }

  @Mutation(returns => SiteResponse)
  async undeleteSite (@Ctx() ctx: Context, @Arg('siteId') siteId: string) {
    return await ctx.svc(SiteService).undelete(siteId)
  }
}

@Resolver(of => SitePermissions)
export class SitePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set or update the public URL for this site.' })
  async launch (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayLaunch(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to rename this site.' })
  async rename (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayRename(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set owner, managers, and organization for this site.' })
  async manageOwners (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayManageOwners(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to create, edit, delete, and undelete pagetrees (such as a sandbox or archive) in this site.' })
  async managePagetrees (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayManagePagetrees(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to promote a pagetree (e.g. a sandbox) to be the live pagetree for this site.' })
  async promotePagetree (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayPromotePagetree(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to soft-delete this site.' })
  async delete (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayDelete(site)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to un-delete this site. Returns false unless the site is currently soft-deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() site: Site) {
    return await ctx.svc(SiteService).mayUndelete(site)
  }
}
