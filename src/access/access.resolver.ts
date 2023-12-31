import { Context } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Query, Resolver } from 'type-graphql'
import { Access, AssetService, DataService, GroupService, PageService, RoleService, SiteService, TemplateService, UserService } from '../internal.js'

@Resolver(of => Access)
export class AccessResolver {
  @Query(returns => Access, { description: 'Shows permissions for the currently authenticated user that are not related to a specific resource. Generally each resource has a `permissions` object stating all the things the currently authenticated user can do to or with that resource. This resolver is for determining permissions that are not related to any particular resource, like whether or not they should be able to view the user management interface.' })
  async access (@Ctx() ctx: Context) {
    return {}
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create new users.' })
  createUsers (@Ctx() ctx: Context) {
    return ctx.svc(UserService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create groups.' })
  createGroups (@Ctx() ctx: Context) {
    return ctx.svc(GroupService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create or edit one or more groups and should therefore see the group management UI.' })
  viewGroupManager (@Ctx() ctx: Context) {
    return ctx.svc(GroupService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create roles.' })
  createRoles (@Ctx() ctx: Context) {
    return ctx.svc(RoleService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create, edit, or add rules to one or more roles and should therefore see the role management UI.' })
  viewRoleManager (@Ctx() ctx: Context) {
    return ctx.svc(RoleService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to create sites.' })
  createSites (@Ctx() ctx: Context) {
    return ctx.svc(SiteService).mayCreate()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit pages in one or more sites and should therefore see the page management UI.' })
  viewPageManager (@Ctx() ctx: Context) {
    return ctx.svc(PageService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit, launch, or create sites and should see the site management UI.' })
  viewSiteManager (@Ctx() ctx: Context) {
    return ctx.svc(SiteService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit assets in one or more sites and should therefore see the asset management UI.' })
  viewAssetManager (@Ctx() ctx: Context) {
    return ctx.svc(AssetService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to edit data of one or more types and should therefore see the data management UI.' })
  viewDataManager (@Ctx() ctx: Context) {
    return ctx.svc(DataService).mayViewManagerUI()
  }

  @FieldResolver(returns => Boolean, { description: 'Currently authenticated user is able to assign templatess to sites and pagetrees and may mark templates as universal.' })
  manageTemplates (@Ctx() ctx: Context) {
    return ctx.svc(TemplateService).mayManage()
  }
}
