import { Arg, Ctx, FieldResolver, ID, Mutation, Resolver, Root } from 'type-graphql'
import { Page, PageFilter, PageResponse, PageService, PagesResponse, TagService, UserTag } from '../internal.js'
import { Context } from '@txstate-mws/graphql-server'

@Resolver(of => UserTag)
export class UserTagResolver {
  @FieldResolver(type => Page, { description: 'All pages linked to this user tag. You may add additional filters.' })
  async pages (@Ctx() ctx: Context, @Root() tag: UserTag, @Arg('filter', { nullable: true }) filter?: PageFilter) {
    return await ctx.svc(PageService).findByTag(tag.id, filter)
  }

  @Mutation(returns => PagesResponse, { description: 'Add the given user tags to the given pages. Do not remove any existing tags.' })
  async addTagsToPages (@Ctx() ctx: Context, @Arg('tagIds', type => [ID]) tagIds: string[], @Arg('pageIds', type => [ID]) pageIds: string[]) {
    return await ctx.svc(TagService).addTagsToPages(tagIds, pageIds)
  }

  @Mutation(returns => PagesResponse, { description: 'Remove the given user tags from the given pages.' })
  async removeTagsFromPages (@Ctx() ctx: Context, @Arg('tagIds', type => [ID]) tagIds: string[], @Arg('pageIds', type => [ID]) pageIds: string[]) {
    return await ctx.svc(TagService).removeTagsFromPages(tagIds, pageIds)
  }

  @Mutation(returns => PagesResponse, { description: 'Replace the user tags on the given pages. Any pre-existing non-listed tags will be removed.' })
  async replaceTagsOnPage (@Ctx() ctx: Context, @Arg('tagIds', type => [ID]) tagIds: string[], @Arg('pageIds', type => [ID]) pageIds: string[], @Arg('includeChildren', { nullable: true }) includeChildren?: boolean) {
    return await ctx.svc(TagService).setPageTags(tagIds, pageIds, includeChildren)
  }
}
