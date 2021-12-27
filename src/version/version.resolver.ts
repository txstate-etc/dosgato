import { Context } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Resolver, Root } from 'type-graphql'
import { JsonData, User, UserService, ObjectVersion, VersionedService } from 'internal'

@Resolver(of => ObjectVersion)
export class VersionResolver {
  @FieldResolver(returns => User, { description: 'The user whose action created this version.' })
  async user (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    return await ctx.svc(UserService).findById(version.userId)
  }

  @FieldResolver(returns => JsonData, { description: 'The full JSON object as it was when this version was recorded.' })
  async data (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    const versioned = await ctx.svc(VersionedService).get(version.id, { version: version.version })
    return versioned!.data
  }
}
