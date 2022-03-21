import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { isNull, unique } from 'txstate-utils'
import {
  Data, DataFilter, DataService, Site, SiteService, Template, TemplateService,
  User, UserService, Role, DataFolder, DataFolderPermission, DataFolderPermissions,
  DataFolderService, CreateDataFolderInput, DataFolderResponse, DataRuleService,
  RoleService
} from 'internal'

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
    let rules = await ctx.svc(DataRuleService).findByDataFolder(folder)
    if (withPermission) rules = rules.filter(r => withPermission.some(p => r.grants[p]))
    return await ctx.svc(RoleService).findByIds(unique(rules.map(r => r.roleId)))
  }

  @FieldResolver(returns => DataFolderPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() folder: DataFolder) {
    return folder
  }

  @Mutation(returns => DataFolderResponse, { description: 'Create a new data folder.' })
  async createDataFolder (@Ctx() ctx: Context, @Arg('args', type => CreateDataFolderInput) args: CreateDataFolderInput) {
    throw new UnimplementedError()
  }

  @Mutation(returns => DataFolderResponse)
  async renameDataFolder (@Ctx() ctx: Context, @Arg('folderId') folderId: string, @Arg('name') name: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => DataFolderResponse)
  async deleteDataFolder (@Ctx() ctx: Context, @Arg('folderId') folderId: string) {
    // If we delete a data folder, do we delete all the data inside it too?
    throw new UnimplementedError()
  }

  @Mutation(returns => DataFolderResponse)
  async undeleteDataFolder (@Ctx() ctx: Context, @Arg('folderId') folderId: string) {
    throw new UnimplementedError()
  }
}

@Resolver(of => DataFolderPermissions)
export class DataFolderPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may create or move data inside this folder.' })
  async create (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    return await ctx.svc(DataFolderService).mayCreate(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this folder but not necessarily move or publish it.' })
  async update (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    return await ctx.svc(DataFolderService).mayUpdate(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this data.' })
  async delete (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    return await ctx.svc(DataFolderService).mayDelete(folder)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this data. Returns false when the data is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() folder: DataFolder) {
    return await ctx.svc(DataFolderService).mayUndelete(folder)
  }
}
