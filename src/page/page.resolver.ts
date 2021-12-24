import { Context, UnimplementedError, ValidatedResponse } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int, Mutation, ID } from 'type-graphql'
import { Pagetree, PagetreeService } from '../pagetree'
import { Role } from '../role'
import { JsonData } from '../scalars/jsondata'
import { Site, SiteService } from '../site'
import { Template, TemplateFilter } from '../template'
import { User, UserService } from '../user'
import { ObjectVersion } from '../version'
import { VersionedService } from '../versionedservice'
import { CreatePageInput, Page, PageFilter, PagePermission, PagePermissions, PageResponse } from './page.model'
import { PageService } from './page.service'
import { isNull } from 'txstate-utils'

@Resolver(of => Page)
export class PageResolver {
  @Query(returns => [Page])
  async pages (@Ctx() ctx: Context, @Arg('filter') filter: PageFilter) {
    return await ctx.svc(PageService).find(filter)
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the page is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() page: Page) {
    if (isNull(page.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(page.deletedBy)
  }

  @FieldResolver(returns => [Page])
  async children (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    return await ctx.svc(PageService).getPageChildren(page, recursive)
  }

  @FieldResolver(returns => Page, { nullable: true, description: 'Returns null when current page is the root page of a pagetree.' })
  async parent (@Ctx() ctx: Context, @Root() page: Page) {
    if (isNull(page.parentInternalId)) return null
    else return await ctx.svc(PageService).findByInternalId(page.parentInternalId)
  }

  @FieldResolver(returns => Page, { description: 'May return itself when page is already the root page.' })
  async rootpage (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).getRootPage(page)
  }

  @FieldResolver(returns => [Page], { description: 'Starts with the parent page and proceeds upward. Last element will be the pagetree\'s root page. Empty array if current page is the root page of a pagetree.' })
  async ancestors (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).getPageAncestors(page)
  }

  @FieldResolver(returns => String)
  async path (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).getPath(page)
  }

  @FieldResolver(returns => Pagetree)
  async pagetree (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PagetreeService).findById(page.pagetreeId)
  }

  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() page: Page) {
    const pagetree = await ctx.svc(PagetreeService).findById(page.pagetreeId)
    if (pagetree) return await ctx.svc(SiteService).findById(pagetree.siteId)
    else throw new Error(`Could not get site for page ${String(page.name)}. Pagetree does not exist.`)
  }

  @FieldResolver(returns => JsonData, { description: 'This is a JSON object that represents everything the editor has created on this page. It is up to the rendering code of the page template and all the component templates to turn this data into an HTML page.' })
  async data (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('published', { nullable: true, description: 'Return the published version of the data. When true, version arg is ignored.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true, description: 'Return the specified version of the data. Ignored when published arg is true. Default is latest and may fail if user has improper permissions.' }) version?: number,
    @Arg('schemaversion', { nullable: true, description: 'Specify the preferred schema version. The API will perform any necessary migrations on the data prior to return. Default is the latest schemaversion.' }) schemaversion?: DateTime
  ) {
    if (!published && !await ctx.svc(PageService).mayViewLatest(page)) throw new Error('User is only permitted to see the published version of this page.')
    const versioned = await ctx.svc(VersionedService).get(page.dataId, { tag: published ? 'published' : undefined, version })
    // TODO: move this code to the page service and make sure migrations get executed
    return versioned!.data
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use on this page or by the authenticated user.' })
  async templates (@Ctx() ctx: Context, @Root() page: Page, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).get(page.dataId)
    return DateTime.fromJSDate(data!.created)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).get(page.dataId)
    return await ctx.svc(UserService).findById(data!.createdBy)
  }

  @FieldResolver(returns => DateTime, { description: 'Date page was last modified. May be used to determine whether page has been modified since being published: (page.published && page.modifiedAt > page.publishedAt).' })
  async modifiedAt (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).get(page.dataId)
    return DateTime.fromJSDate(data!.modified)
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).get(page.dataId)
    return await ctx.svc(UserService).findById(data!.modifiedBy)
  }

  @FieldResolver(returns => Boolean, { description: 'True if the page has a version marked as published. Note that the page could be published but not in the currently active pagetree.' })
  async published (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'True if the page is published, part of the active pagetree, and on a site that is currently launched.' })
  async live (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime, { nullable: true, description: 'Null if the page has never been published, but could have a value. ' })
  async publishedAt (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User, { nullable: true })
  async publishedBy (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() page: Page, @Arg('withPermission', type => [PagePermission], { nullable: true }) withPermission?: PagePermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [ObjectVersion], { description: 'Returns a list of all versions of this page. One of the version numbers can be passed to the data property in order to retrieve that version of the data.' })
  async versions (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PagePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() page: Page) {
    return page
  }

  // Mutations
  @Mutation(returns => PageResponse, { description: 'Create a new page.' })
  async createPage (@Ctx() ctx: Context, @Arg('args', type => CreatePageInput) args: CreatePageInput) {
    // return await ctx.svc(PageService).createPage(args)
  }

  @Mutation(returns => PageResponse)
  async renamePage (@Ctx() ctx: Context, @Arg('pageId') pageId: string, @Arg('name') name: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageResponse)
  async movePage (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('targetId', type => ID) targetId: string,
    @Arg('above', { nullable: true, description: 'When true, page will be moved above the targeted page, rather than inside it.' }) above: boolean
  ) {
    return await ctx.svc(PageService).movePage(pageId, targetId, above)
  }

  @Mutation(returns => ValidatedResponse)
  async publishPage (@Ctx() ctx: Context, @Arg('pageId', type => ID) pageId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async unpublishPage (@Ctx() ctx: Context, @Arg('pageId', type => ID) pageId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageResponse)
  async deletePage (@Ctx() ctx: Context, @Arg('pageId') pageId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageResponse)
  async undeletePage (@Ctx() ctx: Context, @Arg('pageId') pageId: string) {
    throw new UnimplementedError()
  }
}

@Resolver(of => PagePermissions)
export class PagePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may view the latest unpublished version of this page. Published pages are completely public.' })
  async viewLatest (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this page but not necessarily move or publish it.' })
  async update (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may rename this page or move it beneath a page for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).mayMove(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may create or move pages beneath this page.' })
  async create (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).mayCreate(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may publish this page either for the first time or to the latest version.' })
  async publish (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may unpublish this page. Returns false when the page is already unpublished.' })
  async unpublish (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this page.' })
  async delete (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this page. Returns false when the page is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }
}
