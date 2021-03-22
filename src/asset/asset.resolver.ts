import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int } from 'type-graphql'
import { AssetRule, AssetRuleFilter } from '../assetrule'
import { Folder } from '../folder'
import { JsonData } from '../scalars/jsondata'
import { User } from '../user'
import { VersionedService } from '../versionedservice'
import { Asset, AssetFilter, AssetPermissions } from './asset.model'

@Resolver(of => Asset)
export class AssetResolver {
  @Query(returns => [Asset])
  async assets (@Ctx() ctx: Context, @Arg('filter') filter: AssetFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the asset is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Folder, { description: 'Returns parent folder.' })
  async folder (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Folder])
  async ancestors (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() asset: Asset,
    @Arg('published', { nullable: true, description: 'Return the published version of the data.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(asset.dataId)
    return versioned!.data
  }

  @FieldResolver(returns => [AssetRule], { description: 'All assetrules that apply to this asset.' })
  async assetrules (@Ctx() ctx: Context, @Root() asset: Asset, @Arg('filter', { nullable: true }) filter?: AssetRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DateTime, {
    nullable: true,
    description: 'The last time this asset or one of its resizes was downloaded by an anonymous user.'
  })
  async downloadedAt (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
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
  @FieldResolver(returns => Boolean, { description: 'User may update this asset but not necessarily move it.' })
  async update (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this asset beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this asset.' })
  async delete (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this asset. Returns false when the asset is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }
}
