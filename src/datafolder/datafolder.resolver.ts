import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Data, DataFilter } from '../data'
import { Template } from '../template'
import { User } from '../user'
import { DataFolder, DataFolderPermission, DataFolderPermissions } from './datafolder.model'

@Resolver(of => DataFolder)
export class DataFolderResolver {
  @FieldResolver(returns => User, { nullable: true, description: 'Null when the folder is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Template, { description: 'This folder may only contain data with this template.' })
  async template (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() folder: DataFolder,
    @Arg('filter', { nullable: true }) filter: DataFilter
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User], { description: 'Returns a list of all roles with at least one of the specified permissions on this folder, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() folder: DataFolder,
    @Arg('withPermission', type => [DataFolderPermission], { nullable: true }) withPermission?: DataFolderPermission[]
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DataFolderPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() folder: DataFolder) {
    return folder
  }
}

@Resolver(of => DataFolderPermissions)
export class DataFolderPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may create or move data or folders inside this folder.' })
  async create (@Ctx() ctx: Context, @Root() data: Data) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this folder but not necessarily move or publish it.' })
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
