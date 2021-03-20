import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Site } from '../site'
import { User, UserFilter } from './user.model'

@Resolver(of => User)
export class UserResolver {
  @Query(returns => [User])
  async users (@Ctx() ctx: Context, @Arg('filter') filter: UserFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Site], { description: 'Sites the user is able to see.' })
  async sites (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }
}
