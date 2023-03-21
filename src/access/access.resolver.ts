import { Context } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, Query, Resolver } from 'type-graphql'
import { Access, AssetService, DataService, GroupService, PageService, RoleService, SiteService, TemplateService, UrlSafeString, UserService } from '../internal.js'

@Resolver(of => Access)
export class AccessResolver {
  @Query(returns => Access, { description: 'Shows permissions for the currently authenticated user that are not related to a specific resource. Generally each resource has a `permissions` object stating all the things the currently authenticated user can do to or with that resource. This resolver is for determining permissions that are not related to any particular resource, like whether or not they should be able to view the user management interface.' })
  async access (@Ctx() ctx: Context) {
    return {}
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create new users.' })
  async createUsers (@Ctx() ctx: Context) {
    return await ctx.svc(UserService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create groups.' })
  async createGroups (@Ctx() ctx: Context) {
    return await ctx.svc(GroupService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create or edit one or more groups and should therefore see the group management UI.' })
  async viewGroupManager (@Ctx() ctx: Context) {
    return await ctx.svc(GroupService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create roles.' })
  async createRoles (@Ctx() ctx: Context) {
    return await ctx.svc(RoleService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create, edit, or add rules to one or more roles and should therefore see the role management UI.' })
  async viewRoleManager (@Ctx() ctx: Context) {
    return await ctx.svc(RoleService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create sites.' })
  async createSites (@Ctx() ctx: Context) {
    return await ctx.svc(SiteService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit pages in one or more sites and should therefore see the page management UI.' })
  async viewPageManager (@Ctx() ctx: Context) {
    return await ctx.svc(PageService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit, launch, or create sites and should see the site management UI.' })
  async viewSiteManager (@Ctx() ctx: Context) {
    return await ctx.svc(SiteService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit assets in one or more sites and should therefore see the asset management UI.' })
  async viewAssetManager (@Ctx() ctx: Context) {
    return await ctx.svc(AssetService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit data of one or more types and should therefore see the data management UI.' })
  async viewDataManager (@Ctx() ctx: Context) {
    return await ctx.svc(DataService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create global data entries of the specified type.' })
  async createGlobalData (@Ctx() ctx: Context, @Arg('type') type: UrlSafeString) {
    return await ctx.svc(DataService).mayCreateGlobal()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to assign templatess to sites and pagetrees and may mark templates as universal.' })
  async manageTemplates (@Ctx() ctx: Context) {
    return await ctx.svc(TemplateService).mayManage()
  }
}
