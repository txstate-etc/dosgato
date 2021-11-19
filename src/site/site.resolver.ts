import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { AssetPermission } from '../asset'
import { AssetFolder } from '../assetfolder'
import { Data, DataFilter, DataPermission } from '../data'
import { DataFolder, DataFolderFilter } from '../datafolder'
import { Organization, OrganizationService } from '../organization'
import { Page, PagePermission, PageService } from '../page'
import { Pagetree, PagetreeFilter, PagetreeService } from '../pagetree'
import { Role } from '../role'
import { Template, TemplateFilter, TemplateService } from '../template'
import { User, UserService } from '../user'
import { Site, SiteFilter, CreateSiteInput, SitePermission, SitePermissions, SiteResponse, UpdateSiteInput } from './site.model'
import { SiteService } from './site.service'
import { isNotNull, isNull } from 'txstate-utils'

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
    // TODO: This would be better if there was a page filter for root page
    const pages = await ctx.svc(PageService).findByPagetreeId(site.primaryPagetreeId)
    return pages.find(p => isNull(p.parentInternalId))
  }

  @FieldResolver(returns => AssetFolder)
  async assetroot (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [DataFolder], { description: 'Data folders that belong to this site. There is no root folder since data folders are single-depth.' })
  async datafolders (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter') filter: DataFolderFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions anywhere on this site, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() site: Site,
    @Arg('withSitePermission', type => [SitePermission], { nullable: true }) withSitePermission?: SitePermission[],
    @Arg('withAssetPermission', type => [AssetPermission], { nullable: true }) withAssetPermission?: AssetPermission[],
    @Arg('withDataPermission', type => [DataPermission], { nullable: true }) withDataPermission?: DataPermission[],
    @Arg('withPagePermission', type => [PagePermission], { nullable: true }) withPagePermission?: PagePermission[]
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async owner (@Ctx() ctx: Context, @Root() site: Site) {
    if (typeof site.ownerId !== 'undefined') {
      return await ctx.svc(UserService).findByInternalId(site.ownerId)
    }
  }

  @FieldResolver(returns => Organization)
  async organization (@Ctx() ctx: Context, @Root() site: Site) {
    if (typeof site.organizationId !== 'undefined') {
      return await ctx.svc(OrganizationService).find([String(site.organizationId)])
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
    throw new UnimplementedError()
  }

  @Mutation(returns => SiteResponse)
  async updateSite (@Ctx() ctx: Context, @Arg('siteId') siteId: string, @Arg('args', type => UpdateSiteInput) args: UpdateSiteInput) {
    throw new UnimplementedError()
  }

  @Mutation(returns => SiteResponse)
  async deleteSite (@Ctx() ctx: Context, @Arg('siteId') siteId: string, @Arg('hardDelete', { nullable: true, description: 'true if the site should be hard deleted, false for soft deletion' }) hardDelete?: boolean) {
    throw new UnimplementedError()
  }

  @Mutation(returns => SiteResponse)
  async undeleteSite (@Ctx() ctx: Context, @Arg('siteId') siteId: string) {
    throw new UnimplementedError()
  }
}

@Resolver(of => SitePermissions)
export class SitePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set or update the public URL for this site.' })
  async launch (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to rename this site.' })
  async rename (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set owner, managers, and organization for this site.' })
  async manageOwners (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to create, edit, delete, and undelete pagetrees (such as a sandbox or archive) in this site.' })
  async managePagetrees (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to promote a pagetree (e.g. a sandbox) to be the live pagetree for this site.' })
  async promotePagetree (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may add authorization rules that target this site.' })
  async createRules (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to soft-delete this site.' })
  async delete (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to un-delete this site. Returns false unless the site is currently soft-deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }
}
