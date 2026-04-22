import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Query, Ctx, FieldResolver } from 'type-graphql'
import { PageInformation, PaginationResponse, type DGContext } from '../internal.js'

@Resolver(of => PageInformation)
export class PageInformationResolver {
  @Query(returns => PageInformation)
  pageInfo (@Ctx() ctx: Context) {
    return new PageInformation()
  }

  @FieldResolver(returns => PaginationResponse)
  async pages (@Ctx() ctx: DGContext) {
    return await ctx.getPaginationInfo('pages')
  }

  @FieldResolver(returns => PaginationResponse)
  async scheduledPublishes (@Ctx() ctx: DGContext) {
    return await ctx.getPaginationInfo('scheduledPublishes')
  }
}
