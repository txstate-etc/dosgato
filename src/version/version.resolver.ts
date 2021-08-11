import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Resolver, Root } from 'type-graphql'
import { User } from '../user'
import { ObjectVersion } from './version.model'

@Resolver(of => ObjectVersion)
export class VersionResolver {
  @FieldResolver(returns => User)
  async user (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    throw new UnimplementedError()
  }
}
