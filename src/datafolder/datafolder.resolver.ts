import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Data, DataFilter, DataService } from '../data'
import { Site, SiteService } from '../site'
import { Template, TemplateService } from '../template'
import { User, UserService } from '../user'
import { Role } from '../role'
import { DataFolder, DataFolderPermission, DataFolderPermissions } from './datafolder.model'
import { isNull } from 'txstate-utils'

@Resolver(of => DataFolder)
export class DataFolderResolver {
  @FieldResolver(returns => User, { nullable: true, description: 'Null when the folder is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    if (isNull(folder.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(folder.deletedBy)
  }

  @FieldResolver(returns => Template, { description: 'This folder may only contain data with this template.' })
  async template (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    return await ctx.svc(TemplateService).findById(folder.templateId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site this folder belongs to. Null if it is a folder for global data.' })
  async site (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    if (isNull(folder.siteId)) return null
    else return await ctx.svc(SiteService).findById(folder.siteId)
  }

  @FieldResolver(returns => [Data])
  async data (@Ctx() ctx: Context, @Root() folder: DataFolder,
    @Arg('filter', { nullable: true }) filter: DataFilter
  ) {
    return await ctx.svc(DataService).findByFolderInternalId(folder.internalId, filter)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this folder, or any permission if null.' })
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
  @FieldResolver(returns => Boolean, { description: 'User may create or move data inside this folder.' })
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
