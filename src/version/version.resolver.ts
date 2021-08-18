import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Resolver, Root } from 'type-graphql'
import { JsonData } from '../scalars/jsondata'
import { User } from '../user'
import { ObjectVersion } from './version.model'

@Resolver(of => ObjectVersion)
export class VersionResolver {
  @FieldResolver(returns => User, { description: 'The user whose action created this version.' })
  async user (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => JsonData, { description: 'The full JSON object as it was when this version was recorded.' })
  async data (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    throw new UnimplementedError()
  }
}
