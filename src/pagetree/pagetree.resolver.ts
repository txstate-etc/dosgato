import { Context } from '@txstate-mws/graphql-server'
import { isNull, unique } from 'txstate-utils'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import {
  Page, PageService, PageFilter, Role, Site, SiteService, Template, TemplateFilter, TemplateService,
  Pagetree, PagetreePermission, PagetreePermissions, PagetreeResponse, PagetreeService, PagetreeType,
  SiteRuleService, RoleService, CreatePagetreeInput
} from 'internal'

@Resolver(of => Pagetree)
export class PagetreeResolver {
  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(SiteService).findById(pagetree.siteId)
  }

  @FieldResolver(returns => [Page])
  async pages (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('filter', type => PageFilter, { nullable: true }) filter: PageFilter) {
    return await ctx.svc(PageService).findByPagetreeId(pagetree.id, filter)
  }

  @FieldResolver(returns => Page)
  async rootPage (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    const pages = await ctx.svc(PageService).findByPagetreeId(pagetree.id)
    return pages.find((p: Page) => isNull(p.parentInternalId))
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this pagetree.' })
  async templates (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    return await ctx.svc(TemplateService).findByPagetreeId(pagetree.id, filter)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this pagetree, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('withPermission', type => [PagetreePermission], { nullable: true }) withPermission?: PagetreePermission[]) {
    let rules = await ctx.svc(SiteRuleService).findByPagetree(pagetree)
    if (withPermission) {
      rules = rules.filter(r => withPermission.some(p => {
        if (p === PagetreePermission.PROMOTE) {
          return r.grants.promotePagetree
        } else {
          return r.grants.managePagetrees
        }
      }))
    } else {
      rules = rules.filter(r => r.grants.promotePagetree || r.grants.managePagetrees)
    }
    return await ctx.svc(RoleService).findByIds(unique(rules.map(r => r.roleId)))
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
  async createPagetree (@Ctx() ctx: Context, @Arg('args') args: CreatePagetreeInput) {
    return await ctx.svc(PagetreeService).create(args)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Update the name of a pagetree' })
  async updatePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string, @Arg('name') name: string) {
    return await ctx.svc(PagetreeService).renamePagetree(pagetreeId, name)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Soft-delete a pagetree' })
  async deletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    return await ctx.svc(PagetreeService).delete(pagetreeId)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Undo a pagetree delete' })
  async undeletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    return await ctx.svc(PagetreeService).undelete(pagetreeId)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Promote a pagetree from sandbox to primary' })
  async promotePagetree (@Ctx() ctx: Context, @Arg('pagetreeId') pagetreeId: string) {
    await ctx.svc(PagetreeService).promotePagetree(pagetreeId)
  }
}

@Resolver(of => PagetreePermissions)
export class PagetreePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may rename this pagetree.' })
  async rename (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(PagetreeService).mayRename(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this pagetree. Returns false if pagetree is already soft-deleted.' })
  async delete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(PagetreeService).mayDelete(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this pagetree. Returns false if pagetree is not in soft-deleted state.' })
  async undelete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(PagetreeService).mayUndelete(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may promote this pagetree to live. Returns false if pagetree is already live.' })
  async promote (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return await ctx.svc(PagetreeService).mayPromote(pagetree)
  }
}
