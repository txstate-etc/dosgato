import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import { SiteComment, SiteCommentResponse, SiteCommentService, Site, User, UserService, SiteServiceInternal } from '../internal.js'

@Resolver(of => SiteComment)
export class SiteCommentResolver {
  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() sitecomment: SiteComment) {
    return await ctx.svc(SiteServiceInternal).findById(sitecomment.siteId)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() sitecomment: SiteComment) {
    return await ctx.svc(UserService).findByInternalId(sitecomment.createdBy)
  }

  @Mutation(returns => SiteCommentResponse, { description: 'Create a new comment or audit message for a site' })
  async createSiteComment (@Ctx() ctx: Context, @Arg('siteId', type => ID) siteId: string, @Arg('comment') comment: string) {
    return await ctx.svc(SiteCommentService).create(siteId, comment)
  }
}
