import { PageData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { unique } from 'txstate-utils'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation, ID, Query } from 'type-graphql'
import {
  Page, PageService, PageFilter, Role, Site, SiteService, Template, TemplateFilter, TemplateService,
  Pagetree, PagetreePermission, PagetreePermissions, PagetreeResponse, PagetreeService, SiteRuleService,
  RoleService, JsonData, UrlSafeString, AssetFolder, AssetFolderService, PagetreeFilter, DeleteStateNoFinalizeRootDefault
} from '../internal.js'

@Resolver(of => Pagetree)
export class PagetreeResolver {
  @Query(returns => [Pagetree])
  async pagetrees (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: PagetreeFilter) {
    return await ctx.svc(PagetreeService).find({ ...filter, deleteStates: DeleteStateNoFinalizeRootDefault })
  }

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
    const [page] = await ctx.svc(PageService).findByPagetreeId(pagetree.id, { maxDepth: 0 })
    return page
  }

  @FieldResolver(returns => AssetFolder)
  async rootAssetFolder (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    const [folder] = await ctx.svc(AssetFolderService).findByPagetreeId(pagetree.id, { maxDepth: 0 })
    return folder
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use in this pagetree.' })
  async templates (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    const [pagetreeTemplates, siteTemplates] = await Promise.all([
      ctx.svc(TemplateService).findByPagetreeId(pagetree.id, filter),
      ctx.svc(TemplateService).findBySiteId(pagetree.siteId, filter)
    ])
    return unique([...pagetreeTemplates, ...siteTemplates], 'key')
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this pagetree, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() pagetree: Pagetree, @Arg('withPermission', type => [PagetreePermission], { nullable: true }) withPermission?: PagetreePermission[]) {
    let rules = await ctx.svc(SiteRuleService).findByPagetree(pagetree)
    rules = rules.filter(r => r.grants.manageState)
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
  async createPagetree (@Ctx() ctx: Context,
    @Arg('siteId', type => ID) siteId: string,
    @Arg('data', type => JsonData, { description: "Page data after the user has saved the page properties dialog. Data should include templateKey and the admin UI's schemaVersion." }) data: PageData,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(PagetreeService).create(siteId, data, validateOnly)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Update the name of a pagetree', deprecationReason: 'Pagetrees are automatically named and cannot be renamed.' })
  async updatePagetree (@Ctx() ctx: Context,
    @Arg('pagetreeId', type => ID) pagetreeId: string,
    @Arg('name', type => UrlSafeString) name: string,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean
  ) {
    return new PagetreeResponse({ success: false })
  }

  @Mutation(returns => PagetreeResponse, { description: 'Soft-delete a pagetree' })
  async deletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId', type => ID) pagetreeId: string) {
    return await ctx.svc(PagetreeService).delete(pagetreeId)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Undo a pagetree delete' })
  async undeletePagetree (@Ctx() ctx: Context, @Arg('pagetreeId', type => ID) pagetreeId: string) {
    return await ctx.svc(PagetreeService).undelete(pagetreeId)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Promote a pagetree from sandbox to primary' })
  async promotePagetree (@Ctx() ctx: Context, @Arg('pagetreeId', type => ID) pagetreeId: string) {
    return await ctx.svc(PagetreeService).promote(pagetreeId)
  }

  @Mutation(returns => PagetreeResponse, { description: 'Archive a pagetree. Cannot be used on the primary pagetree because a site must always have exactly one primary pagetree.' })
  async archivePagetree (@Ctx() ctx: Context, @Arg('pagetreeId', type => ID) pagetreeId: string) {
    return await ctx.svc(PagetreeService).archive(pagetreeId)
  }
}

@Resolver(of => PagetreePermissions)
export class PagetreePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may rename this pagetree.', deprecationReason: 'Pagetrees are automatically named and cannot be renamed.' })
  rename (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return false
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this pagetree. Returns false if pagetree is already soft-deleted.' })
  delete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return ctx.svc(PagetreeService).mayDelete(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this pagetree. Returns false if pagetree is not in soft-deleted state.' })
  undelete (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return ctx.svc(PagetreeService).mayUndelete(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may promote this pagetree to live. Returns false if pagetree is already live.' })
  promote (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return ctx.svc(PagetreeService).mayPromote(pagetree)
  }

  @FieldResolver(returns => Boolean, { description: 'User may archive this pagetree. Returns false if pagetree is already archived.' })
  archive (@Ctx() ctx: Context, @Root() pagetree: Pagetree) {
    return ctx.svc(PagetreeService).mayArchive(pagetree)
  }
}
