import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { DataFolder } from '../datafolder'
import { JsonData } from '../scalars/jsondata'
import { Site } from '../site'
import { Template } from '../template'
import { User } from '../user'
import { VersionedService } from '../versionedservice'
import { Data, DataFilter, DataPermission, DataPermissions } from './data.model'

@Resolver(of => Data)
export class DataResolver {
  @Query(returns => [Data], { description: 'Only returns data entries that are global (site and folder properties will be null). For site-related data, select the data property from a site.' })
  async globaldata (@Ctx() ctx: Context, @Arg('filter') filter: DataFilter) {
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

  @FieldResolver(returns => Template)
  async template (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DataFolder, { nullable: true })
  async folder (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site, { nullable: true })
  async site (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'True if the data entry has a version marked as published.' })
  async published (@Ctx() ctx: Context, @Root() data: Data) {
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

  @FieldResolver(returns => [User], { description: 'Returns a list of all users with at least one of the specified permissions on this page.' })
  async users (@Ctx() ctx: Context, @Root() data: Data, @Arg('withPermission', type => [DataPermission]) withPermission: DataPermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User], { description: 'Returns a list of all groups with at least one of the specified permissions on this page.' })
  async groups (@Ctx() ctx: Context, @Root() data: Data, @Arg('withPermission', type => [DataPermission]) withPermission: DataPermission[]) {
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

  @FieldResolver(returns => Boolean, { description: 'User may publish this data entry either for the first time or to the latest version.' })
  async publish (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may unpublish this data entry. Returns false when already unpublished.' })
  async unpublish (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this data beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() data: Data) {
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
