import { Arg, Ctx, FieldResolver, Query, Resolver, Root } from 'type-graphql'
import { Context } from '@txstate-mws/graphql-server'
import { Data, DataFilter, DataFolder, DataFolderFilter, DataFolderService, DataRoot, DataRootFilter, DataRootPermissions, DataRootService, DataService } from '../internal.js'

@Resolver(of => DataRoot)
export class DataRootResolver {
  @Query(returns => [DataRoot])
  async dataroots (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: DataRootFilter) {
    return await ctx.svc(DataRootService).find(filter)
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() dataroot: DataRoot, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    return await ctx.svc(DataService).findByDataRoot(dataroot, filter)
  }

  @FieldResolver(returns => [DataFolder])
  async datafolders (@Ctx() ctx: Context, @Root() dataroot: DataRoot, @Arg('filter', { nullable: true }) filter?: DataFolderFilter) {
    return await ctx.svc(DataFolderService).findByDataRoot(dataroot, filter)
  }

  @FieldResolver(returns => DataRootPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() dataRoot: DataRoot) {
    return dataRoot
  }
}

@Resolver(of => DataRootPermissions)
export class DataRootPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may create or move data inside this data root.' })
  async create (@Ctx() ctx: Context, @Root() folder: DataRoot) {
    return await ctx.svc(DataRootService).mayCreate(folder)
  }
}
