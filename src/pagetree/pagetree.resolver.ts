import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Page } from '../page'
import { PageFilter } from '../page/page.model'
import { Role } from '../role'
import { Site } from '../site'
import { Template, TemplateFilter } from '../template'
import { PageTree, PageTreePermission, PageTreePermissions } from './pagetree.model'

@Resolver(of => PageTree)
export class PageTreeResolver {
  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Page])
  async pages (@Ctx() ctx: Context, @Root() pagetree: PageTree, @Arg('filter', { nullable: true }) filter: PageFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Page)
  async rootPage (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this pagetree.' })
  async templates (@Ctx() ctx: Context, @Root() pagetree: PageTree, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() page: Page, @Arg('withPermission', type => [PageTreePermission], { nullable: true }) withPermission?: PageTreePermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PageTreePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() pagetree: PageTree) {
    return pagetree
  }
}

@Resolver(of => PageTreePermissions)
export class PageTreePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may rename this pagetree.' })
  async rename (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this pagetree. Returns false if pagetree is already soft-deleted.' })
  async delete (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this pagetree. Returns false if pagetree is not in soft-deleted state.' })
  async undelete (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may promote this pagetree to live. Returns false if pagetree is already live.' })
  async promote (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    throw new UnimplementedError()
  }
}
