import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Asset, AssetFilter } from '../asset'
import { AssetRule, AssetRuleFilter } from '../assetrule'
import { User } from '../user'
import { AssetFolder, FolderOrAsset, AssetFolderPermissions } from './assetfolder.model'

@Resolver(of => AssetFolder)
export class AssetFolderResolver {
  @FieldResolver(returns => User, { nullable: true, description: 'Null when the folder is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => AssetFolder, { nullable: true, description: 'Returns parent folder, or null if this folder is the site root.' })
  async folder (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [AssetFolder])
  async ancestors (@Ctx() ctx: Context, @Root() folder: AssetFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Asset])
  async assets (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('filter', { nullable: true }) filter: AssetFilter,
    @Arg('recursive', { nullable: true }) recursive: boolean
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [FolderOrAsset])
  async children (@Ctx() ctx: Context, @Root() folder: AssetFolder,
    @Arg('recursive', { nullable: true }) recursive: boolean
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [AssetRule], { description: 'All assetrules that apply to this folder.' })
  async assetrules (@Ctx() ctx: Context, @Root() folder: AssetFolder, @Arg('filter', type => AssetRuleFilter, { nullable: true }) filter?: AssetRuleFilter) {
    throw new UnimplementedError()
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
  async create (@Ctx() ctx: Context, @Root() asset: Asset) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this folder but not necessarily move or publish it.' })
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
