import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Asset, AssetFilter } from '../asset'
import { AssetRuleService } from '../assetrule'
import { Role, RoleService } from '../role'
import { User } from '../user'
import { AssetFolder, AssetFolderFilter, AssetFolderPermission, AssetFolderPermissions } from './assetfolder.model'
import { AssetFolderService } from './assetfolder.service'

@Resolver(of => AssetFolder)
export class AssetFolderResolver {
  @FieldResolver(returns => User, { nullable: true, description: 'Null when the folder is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => AssetFolder, { nullable: true, description: 'Returns parent folder, or null if this folder is the site root.' })
  async folder (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).getParent(folder)
  }

  @FieldResolver(returns => [AssetFolder])
  async ancestors (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).getAncestors(folder)
  }

  @FieldResolver(returns => [Asset])
  async assets (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('filter', { nullable: true }) filter?: AssetFilter,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    // TODO: implement filters
    return await ctx.svc(AssetFolderService).getChildAssets(folder, recursive)
  }

  @FieldResolver(returns => [AssetFolder])
  async folders (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('filter', { nullable: true }) filter?: AssetFolderFilter,
    @Arg('recursive', { nullable: true }) recursive?: boolean
  ) {
    // TODO: implement filters
    return await ctx.svc(AssetFolderService).getChildFolders(folder, recursive)
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

  @FieldResolver(returns => Boolean, { description: 'User may move this asset beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayMove(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this asset.' })
  async delete (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayDelete(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this asset. Returns false when the asset is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    return await ctx.svc(AssetFolderService).mayUndelete(folder)
  }
}
