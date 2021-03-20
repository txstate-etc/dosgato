import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { PageRule, PageRuleFilter } from '../pagerule'
import { JsonData } from '../scalars/jsondata'
import { User } from '../user'
import { VersionedService } from '../versionedservice'
import { Page, PageFilter, PagePermissions } from './page.model'

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

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('published', { nullable: true, description: 'Return the published version of the data.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(page.dataId)
    return versioned!.data
  }

  @FieldResolver(returns => [PageRule], { description: 'All pagerules that apply to this page.' })
  async pagerules (@Ctx() ctx: Context, @Root() page: Page, @Arg('filter', { nullable: true }) filter?: PageRuleFilter) {
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

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean)
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
  async viewlatest (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this page but not necessarily move or publish it.' })
  async update (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this page beneath a page for which they have the `create` permission.' })
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
