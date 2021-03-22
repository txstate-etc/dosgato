import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { DataRule, DataRuleFilter } from '../datarule'
import { JsonData } from '../scalars/jsondata'
import { User } from '../user'
import { VersionedService } from '../versionedservice'
import { Data, DataFilter, DataPermissions } from './data.model'

@Resolver(of => Data)
export class DataResolver {
  @Query(returns => [Data])
  async dataentries (@Ctx() ctx: Context, @Arg('filter') filter: DataFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the data is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() data: Data,
    @Arg('published', { nullable: true, description: 'Return the published version of the data.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(data.dataId)
    return versioned!.data
  }

  @FieldResolver(returns => [DataRule], { description: 'All datarules that apply to this data.' })
  async datarules (@Ctx() ctx: Context, @Root() data: Data, @Arg('filter', { nullable: true }) filter?: DataRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DataPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() data: Data) {
    return data
  }
}

@Resolver(of => DataPermissions)
export class DataPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may update this data but not necessarily move it.' })
  async update (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this data.' })
  async delete (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this data. Returns false when the data is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }
}
