import { PageInformation, PaginationResponse } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver } from 'type-graphql'
import type { DGContext } from '../internal.js'

// The generic `pageInfo` Query itself is provided by the library's `PageInformationResolver`
// (registered in index.ts). Here we contribute one field resolver per paginated top-level
// query so clients can read its pagination metadata back via `pageInfo { <queryType> }`.
@Resolver(of => PageInformation)
export class DGPageInformationResolver {
  @FieldResolver(returns => PaginationResponse, { nullable: true })
  async pages (@Ctx() ctx: DGContext) {
    return await ctx.getPaginationInfo('pages')
  }

  @FieldResolver(returns => PaginationResponse, { nullable: true })
  async scheduledPublishes (@Ctx() ctx: DGContext) {
    return await ctx.getPaginationInfo('scheduledPublishes')
  }
}
