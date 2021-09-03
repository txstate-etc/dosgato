import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { AssetPermission } from '../asset'
import { AssetFolder } from '../assetfolder'
import { Data, DataFilter, DataPermission } from '../data'
import { DataFolder, DataFolderFilter } from '../datafolder'
import { Page, PagePermission } from '../page'
import { PageTree, PageTreeFilter } from '../pagetree'
import { Role } from '../role'
import { Template, TemplateFilter } from '../template'
import { User } from '../user'
import { Site, SiteFilter, SitePermission, SitePermissions } from './site.model'

@Resolver(of => Site)
export class SiteResolver {
  @Query(returns => [Site])
  async sites (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: SiteFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree])
  async pagetrees (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: PageTreeFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Page)
  async pageroot (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
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
    throw new UnimplementedError()
  }

  @FieldResolver(returns => String)
  async organization (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User])
  async managers (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this site.' })
  async templates (@Ctx() ctx: Context, @Root() site: Site, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'True if the site has been launched (i.e. is available on a specified URL outside the editing host.' })
  async launched (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => SitePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() site: Site) {
    return site
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
