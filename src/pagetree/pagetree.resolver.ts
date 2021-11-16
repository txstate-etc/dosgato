import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { isNull } from 'txstate-utils'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { Page, PageService } from '../page'
import { PageFilter } from '../page/page.model'
import { Role } from '../role'
import { Site, SiteService } from '../site'
import { Template, TemplateFilter } from '../template'
import { PageTree, PageTreePermission, PageTreePermissions, PageTreeResponse, PageTreeType } from './pagetree.model'

@Resolver(of => PageTree)
export class PageTreeResolver {
  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    return await ctx.svc(SiteService).findById(String(pagetree.siteId))
  }

  @FieldResolver(returns => [Page])
  async pages (@Ctx() ctx: Context, @Root() pagetree: PageTree, @Arg('filter', { nullable: true }) filter: PageFilter) {
    return await ctx.svc(PageService).findByPagetreeId(pagetree.id, filter)
  }

  @FieldResolver(returns => Page)
  async rootPage (@Ctx() ctx: Context, @Root() pagetree: PageTree) {
    const pages = await ctx.svc(PageService).findByPagetreeId(pagetree.id)
    return pages.find((p: Page) => isNull(p.parentInternalId))
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

  /* Mutations */
  @Mutation(returns => PageTreeResponse, { description: 'Create a pagetree in an existing site' })
  async createPagetree (@Ctx() ctx: Context, @Arg('siteId') siteId: string, @Arg('name') name: string, @Arg('type', type => PageTreeType, { nullable: true }) type: PageTreeType) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageTreeResponse, { description: 'Update the name of a pagetree' })
  async updatePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string, @Arg('name') name: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageTreeResponse, { description: 'Soft-delete a pagetree' })
  async deletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    // should not be able to delete the primary pagetree?
    throw new UnimplementedError()
  }

  @Mutation(returns => PageTreeResponse, { description: 'Undo a pagetree delete' })
  async restorePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    throw new UnimplementedError()
  }

  // TODO: Should these two mutations just be one mutation that updates the pagetree type?
  @Mutation(returns => PageTreeResponse, { description: 'Promote a pagetree from sandbox to primary' })
  async promotePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageTreeResponse, { description: 'Archive a pagetree' })
  async archivePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    throw new UnimplementedError()
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
