import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { isNull } from 'txstate-utils'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { Page, PageService } from '../page'
import { PageFilter } from '../page/page.model'
import { Role } from '../role'
import { Site, SiteService } from '../site'
import { Template, TemplateFilter } from '../template'
import { Pagetree, PagetreePermission, PagetreePermissions, PagetreeResponse, PagetreeType } from './pagetree.model'

@Resolver(of => Pagetree)
export class PagetreeResolver {
  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(SiteService).findById(pagetree.siteId)
  }

  @FieldResolver(returns => [Page])
  async pages (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('filter', { nullable: true }) filter: PageFilter) {
    return await ctx.svc(PageService).findByPagetreeId(pagetree.id, filter)
  }

  @FieldResolver(returns => Page)
  async rootPage (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    const pages = await ctx.svc(PageService).findByPagetreeId(pagetree.id)
    return pages.find((p: Page) => isNull(p.parentInternalId))
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this pagetree.' })
  async templates (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() page: Page, @Arg('withPermission', type => [PagetreePermission], { nullable: true }) withPermission?: PagetreePermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PagetreePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() pagetree: Pagetree) {
    return pagetree
  }

  /* Mutations */
  @Mutation(returns => PagetreeResponse, { description: 'Create a pagetree in an existing site' })
  async createPagetree (@Ctx() ctx: Context, @Arg('siteId') siteId: string, @Arg('name') name: string, @Arg('type', type => PagetreeType, { nullable: true }) type: PagetreeType) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PagetreeResponse, { description: 'Update the name of a pagetree' })
  async updatePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string, @Arg('name') name: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PagetreeResponse, { description: 'Soft-delete a pagetree' })
  async deletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    // should not be able to delete the primary pagetree?
    throw new UnimplementedError()
  }

  @Mutation(returns => PagetreeResponse, { description: 'Undo a pagetree delete' })
  async undeletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PagetreeResponse, { description: 'Promote a pagetree from sandbox to primary' })
  async promotePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    throw new UnimplementedError()
  }
}

@Resolver(of => PagetreePermissions)
export class PagetreePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may rename this pagetree.' })
  async rename (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this pagetree. Returns false if pagetree is already soft-deleted.' })
  async delete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this pagetree. Returns false if pagetree is not in soft-deleted state.' })
  async undelete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may promote this pagetree to live. Returns false if pagetree is already live.' })
  async promote (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    throw new UnimplementedError()
  }
}
