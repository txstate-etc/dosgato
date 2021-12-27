import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  AssetFolder, Role, JsonData, User, UserService, ObjectVersion, VersionedService,
  Asset, AssetFilter, AssetPermission, AssetPermissions, AssetResize, AssetService
} from 'internal'

@Resolver(of => Asset)
export class AssetResolver {
  @Query(returns => [Asset])
  async assets (@Ctx() ctx: Context, @Arg('filter') filter: AssetFilter) {
    return await ctx.svc(AssetService).find(filter)
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the asset is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    if (isNull(asset.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(asset.deletedBy)
  }

  @FieldResolver(returns => AssetFolder, { description: 'Returns parent folder.' })
  async folder (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [AssetFolder], { description: 'Starts with the parent folder and proceeds upward. Last element will be the site\'s root folder.' })
  async ancestors (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() asset: Asset,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(asset.dataId, { version })
    return versioned!.data
  }

  @FieldResolver(returns => [AssetResize], { nullable: true, description: 'List of available resized versions of this asset.' })
  async resizes (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    const data = await ctx.svc(VersionedService).get(asset.dataId)
    return DateTime.fromJSDate(data!.created)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    const data = await ctx.svc(VersionedService).get(asset.dataId)
    return await ctx.svc(UserService).findById(data!.createdBy)
  }

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    const data = await ctx.svc(VersionedService).get(asset.dataId)
    return DateTime.fromJSDate(data!.modified)
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    const data = await ctx.svc(VersionedService).get(asset.dataId)
    return await ctx.svc(UserService).findById(data!.modifiedBy)
  }

  @FieldResolver(returns => DateTime, {
    nullable: true,
    description: 'The last time this asset or one of its resizes was downloaded by an anonymous user.'
  })
  async downloadedAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this asset, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() data: Asset, @Arg('withPermission', type => [AssetPermission], { nullable: true }) withPermission?: AssetPermission[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [ObjectVersion], { description: 'Returns a list of all versions of this asset. One of the version numbers can be passed to the data property in order to retrieve that version of the data.' })
  async versions (@Ctx() ctx: Context, @Root() asset: Asset) {
    const versions = await ctx.svc(VersionedService).listVersions(asset.dataId)
    return versions.map(v => new ObjectVersion(v))
  }

  @FieldResolver(returns => AssetPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() asset: Asset) {
    return asset
  }
}

@Resolver(of => AssetPermissions)
export class AssetPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may view this asset in the asset manager UI.' })
  async viewForEdit (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).mayViewForEdit(asset)
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this asset but not necessarily move it.' })
  async update (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).mayUpdate(asset)
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this asset beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).mayMove(asset)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this asset.' })
  async delete (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).mayDelete(asset)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this asset. Returns false when the asset is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).mayUndelete(asset)
  }
}
