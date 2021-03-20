import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { PageTree } from '../pagetree'
import { Role, RoleFilter } from './role.model'

@Resolver(of => Role)
export class RoleResolver {
  @Query(returns => [Role])
  async roles (@Ctx() ctx: Context, @Arg('filter') filter: RoleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree])
  async pagetrees (@Ctx() ctx: Context, @Root() role: Role) {
    throw new UnimplementedError()
  }
}
