import { Context } from '@txstate-mws/graphql-server'
import { isNull } from 'txstate-utils'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation, ID, Query } from 'type-graphql'
import {
  Asset, AssetFilter, Role, RoleService, User, AssetFolder, AssetFolderFilter,
  AssetFolderPermission, AssetFolderPermissions, AssetFolderService, AssetRuleService,
  AssetFolderResponse, CreateAssetFolderInput, UrlSafeString, Site, SiteService, DeleteStateRootDefault, UserService
} from '../internal.js'

@Resolver(of => AssetFolder)
export class AssetFolderResolver {
  @Query(returns => [AssetFolder])
  async assetfolders (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: AssetFolderFilter) {
    return await ctx.svc(AssetFolderService).find({ ...filter, deleteStates: filter?.deleteStates ?? DeleteStateRootDefault })
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the folder is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    if (isNull(folder.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(folder.deletedBy)
  }

  @FieldResolver(returns => AssetFolder, { nullable: true, description: 'Returns parent folder, or null if this folder is the site root.' })
  async folder (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).getParent(folder)
  }

  @FieldResolver(returns => [AssetFolder])
  async ancestors (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).getAncestors(folder)
  }

  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(SiteService).findById(folder.siteId)
  }

  @FieldResolver(returns => String)
  async path (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).getPath(folder)
  }

  @FieldResolver(returns => [Asset])
  async assets (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('filter', { nullable: true }) filter?: AssetFilter,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    return await ctx.svc(AssetFolderService).getChildAssets(folder, recursive, filter)
  }

  @FieldResolver(returns => [AssetFolder])
  async folders (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('filter', { nullable: true }) filter?: AssetFolderFilter,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    return await ctx.svc(AssetFolderService).getChildFolders(folder, recursive, filter)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this folder, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() folder: AssetFolder, @Arg('withPermission', type => [AssetFolderPermission], { nullable: true }) withPermission?: AssetFolderPermission[]) {
    let rules = await ctx.svc(AssetRuleService).findByAssetFolder(folder)
    if (withPermission) rules = rules.filter(r => withPermission.some(p => r.grants[p]))
    return await ctx.svc(RoleService).findByIds(rules.map(r => r.roleId))
  }

  @FieldResolver(returns => AssetFolderPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() folder: AssetFolder) {
    return folder
  }

  @Mutation(returns => AssetFolderResponse, { description: 'Create a new asset folder.' })
  async createAssetFolder (@Ctx() ctx: Context, @Arg('args', type => CreateAssetFolderInput) args: CreateAssetFolderInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(AssetFolderService).create(args, validateOnly)
  }

  @Mutation(returns => AssetFolderResponse)
  async renameAssetFolder (@Ctx() ctx: Context, @Arg('folderId', type => ID) folderId: string, @Arg('name', type => UrlSafeString) name: string, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(AssetFolderService).rename(folderId, name, validateOnly)
  }

  @Mutation(returns => AssetFolderResponse)
  async deleteAssetFolder (@Ctx() ctx: Context, @Arg('folderId', type => ID) folderId: string) {
    return await ctx.svc(AssetFolderService).delete(folderId)
  }

  @Mutation(returns => AssetFolderResponse)
  async finalizeAssetFolderDeletion (@Ctx() ctx: Context, @Arg('folderId', type => ID) folderId: string) {
    return await ctx.svc(AssetFolderService).finalizeDeletion(folderId)
  }

  @Mutation(returns => AssetFolderResponse)
  async undeleteAssetFolder (@Ctx() ctx: Context, @Arg('folderId', type => ID) folderId: string) {
    return await ctx.svc(AssetFolderService).undelete(folderId)
  }
}

@Resolver(of => AssetFolderPermissions)
export class AssetFolderPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may create or move assets or folders inside this folder.' })
  async create (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayCreate(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this folder but not necessarily move or publish it.' })
  async update (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayUpdate(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this asset folder beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayMove(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this asset folder.' })
  async delete (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayDelete(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this asset folder. Returns false when the asset folder is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayUndelete(folder)
  }
}
