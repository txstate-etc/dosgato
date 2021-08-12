import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { DataFolder } from '../datafolder'
import { Role } from '../role'
import { JsonData } from '../scalars/jsondata'
import { Site } from '../site'
import { Template } from '../template'
import { User } from '../user'
import { ObjectVersion } from '../version'
import { VersionedService } from '../versionedservice'
import { Data, DataFilter, DataPermission, DataPermissions } from './data.model'

@Resolver(of => Data)
export class DataResolver {
  @Query(returns => [Data], { name: 'data', description: 'Data are pieces of shareable versioned content with a template and a dialog but not rendering code. The data will be consumed by component templates, each of which will do its own rendering of the data. For example, an Article data type could be displayed by an Article List component or an Article Detail component. In addition, outside services could access the article data directly from GraphQL.' })
  async dataquery (@Ctx() ctx: Context, @Arg('filter') filter: DataFilter) {
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
    const versioned = await ctx.svc(VersionedService).get(data.dataId, { version })
    return versioned!.data
  }

  @FieldResolver(returns => Template, { description: 'Data are created with a template that defines the schema and provides an editing dialog. The template never changes (except as part of an upgrade task).' })
  async template (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DataFolder, { nullable: true, description: 'Parent folder containing the data entry. Null if the data exists at the global or site root. In the data area, there is only one level of folders for organization - folders do not contain more folders.' })
  async folder (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this data entry belongs. Data can be shared across sites, but one site is still the owner. Null if the data is global (not associated with any site).' })
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

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() data: Data, @Arg('withPermission', type => [DataPermission], { nullable: true }) withPermission?: DataPermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [ObjectVersion], { description: 'Returns a list of all versions of this data entry. One of the version numbers can be passed to the data property in order to retrieve that version.' })
  async versions (@Ctx() ctx: Context, @Root() data: Data) {
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
