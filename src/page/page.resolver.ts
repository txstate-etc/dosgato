import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Page, PageFilter } from './page.model'

@Resolver(of => Page)
export class PageResolver {
  @Query(returns => [Page])
  async pages (@Ctx() ctx: Context, @Arg('filter') filter: PageFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Page])
  async children (@Ctx() ctx: Context, @Root() page: Page) {
    throw new UnimplementedError()
  }
}
