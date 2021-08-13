import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { PageTree } from '../pagetree'
import { Role } from '../role'
import { JsonData } from '../scalars/jsondata'
import { Site } from '../site'
import { Template, TemplateFilter } from '../template'
import { User } from '../user'
import { ObjectVersion } from '../version'
import { VersionedService } from '../versionedservice'
import { Page, PageFilter, PagePermission, PagePermissions } from './page.model'

@Resolver(of => Page)
export class PageResolver {
  @Query(returns => [Page])
  async pages (@Ctx() ctx: Context, @Arg('filter') filter: PageFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the page is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Page])
  async children (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Page, { nullable: true, description: 'Returns null when current page is the root page of a pagetree.' })
  async parent (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Page)
  async rootpage (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Page], { description: 'Starts with the parent page and proceeds upward. Last element will be the pagetree\'s root page. Empty array if current page is the root page of a pagetree.' })
  async ancestors (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PageTree)
  async pagetree (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('published', { nullable: true, description: 'Return the published version of the data. When true, version arg is ignored.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true, description: 'Return the specified version of the data. Ignored when published arg is true.' }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(page.dataId, { tag: published ? 'published' : undefined, version })
    return versioned!.data
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use on this page.' })
  async templates (@Ctx() ctx: Context, @Root() page: Page, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime, { description: 'Date page was last modified. May be used to determine whether page has been modified since being published: (page.published && page.modifiedAt > page.publishedAt).' })
  async modifiedAt (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'True if the page has a version marked as published AND the page is in the currently active pagetree.' })
  async published (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime, { nullable: true })
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
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may create or move pages beneath this page.' })
  async create (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
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
