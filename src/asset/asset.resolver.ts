import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int, Mutation, ID } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  AssetFolder, AssetFolderService, Role, JsonData, User, UserService, ObjectVersion, VersionedService,
  Asset, AssetFilter, AssetPermission, AssetPermissions, AssetResize, AssetService, AssetRuleService,
  RoleService, AssetResponse, UpdateAssetInput, DownloadsFilter, DownloadRecord
} from '../internal.js'

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
    return await ctx.svc(AssetFolderService).findByInternalId(asset.folderInternalId)
  }

  @FieldResolver(returns => [AssetFolder], { description: 'Starts with the parent folder and proceeds upward. Last element will be the site\'s root folder.' })
  async ancestors (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).getAncestors(asset)
  }

  @FieldResolver(returns => String)
  async path (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).getPath(asset)
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() asset: Asset,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(asset.dataId, { version })
    return versioned!.data
  }

  @FieldResolver(returns => String, { description: 'The file name of the file when it was uploaded.' })
  async uploadedFilename (@Ctx() ctx: Context, @Root() asset: Asset) {
    const data = await ctx.svc(AssetService).getData(asset)
    return data.uploadedFilename ?? asset.filename
  }

  @FieldResolver(returns => [DownloadRecord], { description: 'Download counts for this asset. Use filter to summarize them by day, week, or month.' })
  async downloads (@Ctx() ctx: Context, @Root() asset: Asset, @Arg('filter', { nullable: true }) filter: DownloadsFilter) {
    return await ctx.svc(AssetService).getDownloads(asset, filter)
  }

  @FieldResolver(returns => [AssetResize], { description: 'List of available resized versions of this asset.' })
  async resizes (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).getResizes(asset)
  }

  @FieldResolver(returns => AssetResize, { nullable: true, description: 'Returns a resize appropriate as a universal thumbnail. Will be in a format supported by all browsers and as small as possible.' })
  async thumbnail (@Ctx() ctx: Context, @Root() asset: Asset) {
    return await ctx.svc(AssetService).getThumbnail(asset)
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
    return await ctx.svc(AssetService).getLatestDownload(asset)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this asset, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() asset: Asset, @Arg('withPermission', type => [AssetPermission], { nullable: true }) withPermission?: AssetPermission[]) {
    let rules = await ctx.svc(AssetRuleService).findByAsset(asset)
    if (withPermission) rules = rules.filter(r => withPermission.some(p => r.grants[p]))
    return await ctx.svc(RoleService).findByIds(rules.map(r => r.roleId))
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

  @Mutation(returns => AssetResponse, { description: 'Update an asset' })
  async updateAsset (@Ctx() ctx: Context, @Arg('args', type => UpdateAssetInput) args: UpdateAssetInput) {
    throw new UnimplementedError()
  }

  @Mutation(returns => AssetResponse)
  async moveAsset (@Ctx() ctx: Context,
    @Arg('assetId', type => ID) assetId: string,
    @Arg('targetFolderId', type => ID) targetFolderId: string
  ) {
    return await ctx.svc(AssetService).move(assetId, targetFolderId)
  }

  @Mutation(returns => AssetResponse)
  async deleteAsset (@Ctx() ctx: Context, @Arg('assetId', type => ID) assetId: string) {
    return await ctx.svc(AssetService).delete(assetId)
  }

  @Mutation(returns => AssetResponse)
  async undeleteAsset (@Ctx() ctx: Context, @Arg('assetId', type => ID) assetId: string) {
    return await ctx.svc(AssetService).undelete(assetId)
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

@Resolver(of => AssetResize)
export class AssetResizeResolver {
  @FieldResolver(returns => [DownloadRecord], { description: 'Download counts for this particular resize. Use filter to summarize them by day, week, or month.' })
  async downloads (@Ctx() ctx: Context, @Root() resize: AssetResize, @Arg('filter', { nullable: true }) filter: DownloadsFilter) {
    return await ctx.svc(AssetService).getResizeDownloads(resize, filter)
  }
}
