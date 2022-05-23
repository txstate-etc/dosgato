import { Arg, Ctx, FieldResolver, Query, Resolver, Root } from 'type-graphql'
import { Context } from '@txstate-mws/graphql-server'
import { Data, DataFilter, DataFolder, DataFolderFilter, DataFolderService, DataRoot, DataRootFilter, DataRootPermissions, DataRootService, DataService } from 'internal'

@Resolver(of => DataRoot)
export class DataRootResolver {
  @Query(returns => [DataRoot])
  async dataroots (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: DataRootFilter) {
    return await ctx.svc(DataRootService).find(filter)
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() dataroot: DataRoot, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    if (dataroot.site) return await ctx.svc(DataService).findBySiteId(dataroot.site.id, { ...filter, root: true })
    return await ctx.svc(DataService).find({ ...filter, global: true, root: true })
  }

  @FieldResolver(returns => [DataFolder], { description: 'Data folders that belong to this site. There is no root folder since data folders are single-depth.' })
  async datafolders (@Ctx() ctx: Context, @Root() dataroot: DataRoot, @Arg('filter', { nullable: true }) filter?: DataFolderFilter) {
    if (dataroot.site) return await ctx.svc(DataFolderService).findBySiteId(dataroot.site.id, filter)
    return await ctx.svc(DataFolderService).find({ ...filter, global: true })
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
