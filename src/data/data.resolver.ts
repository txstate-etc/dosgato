import { Context, UnimplementedError, ValidatedResponse } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int, Mutation, ID } from 'type-graphql'
import { isNull, unique } from 'txstate-utils'
import {
  DataFolder, DataFolderService, Role, JsonData, Site, SiteService, Template,
  TemplateService, User, UserService, ObjectVersion, VersionedService, Data,
  DataFilter, DataPermission, DataPermissions, DataService, DataResponse, CreateDataInput,
  UpdateDataInput, DataRuleService, RoleService
} from 'internal'

@Resolver(of => Data)
export class DataResolver {
  @Query(returns => [Data], { name: 'data' })
  async dataquery (@Ctx() ctx: Context, @Arg('filter') filter: DataFilter) {
    return await ctx.svc(DataService).find(filter)
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the data is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() data: Data) {
    if (isNull(data.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(data.deletedBy)
  }

  @FieldResolver(returns => JsonData)
  async data (@Ctx() ctx: Context, @Root() data: Data,
    @Arg('published', { nullable: true, description: 'Return the published version of the data.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true }) version?: number
  ) {
    const versioned = await ctx.svc(VersionedService).get(data.dataId, { version })
    return versioned!.data
  }

  @FieldResolver(returns => Template, { description: 'Data are created with a template that defines the schema and provides an editing dialog. The template never changes (except as part of an upgrade task).' })
  async template (@Ctx() ctx: Context, @Root() data: Data) {
    // TODO: Is there another way to get this?
    const versioned = await ctx.svc(VersionedService).get(data.dataId)
    const indexes = await ctx.svc(VersionedService).getIndexes(data.dataId, versioned!.version)
    const templateKeyIndex = indexes.find(i => i.name === 'template')
    const templateKey = templateKeyIndex!.values[0]
    return await ctx.svc(TemplateService).findByKey(templateKey)
  }

  @FieldResolver(returns => DataFolder, { nullable: true, description: 'Parent folder containing the data entry. Null if the data exists at the global or site root. In the data area, there is only one level of folders for organization - folders do not contain more folders.' })
  async folder (@Ctx() ctx: Context, @Root() data: Data) {
    if (isNull(data.folderInternalId)) return null
    else return await ctx.svc(DataFolderService).findByInternalId(data.folderInternalId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this data entry belongs. Data can be shared across sites, but one site is still the owner. Null if the data is global (not associated with any site).' })
  async site (@Ctx() ctx: Context, @Root() data: Data) {
    if (isNull(data.siteId)) return null
    else return await ctx.svc(SiteService).findById(data.siteId)
  }

  @FieldResolver(returns => Boolean, { description: 'True if the data entry has a version marked as published.' })
  async published (@Ctx() ctx: Context, @Root() data: Data) {
    const published = await ctx.svc(VersionedService).get(data.dataId, { tag: 'published' })
    return (typeof published) !== 'undefined'
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.dataId)
    return DateTime.fromJSDate(dataFromStorage!.created)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.dataId)
    return await ctx.svc(UserService).findById(dataFromStorage!.createdBy)
  }

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.dataId)
    return DateTime.fromJSDate(dataFromStorage!.modified)
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.dataId)
    return await ctx.svc(UserService).findById(dataFromStorage!.modifiedBy)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() data: Data, @Arg('withPermission', type => [DataPermission], { nullable: true }) withPermission?: DataPermission[]) {
    let rules = await ctx.svc(DataRuleService).findByDataEntry(data)
    if (withPermission) rules = rules.filter(r => withPermission.some(p => r.grants[p]))
    return await ctx.svc(RoleService).findByIds(unique(rules.map(r => r.roleId)))
  }

  @FieldResolver(returns => [ObjectVersion], { description: 'Returns a list of all versions of this data entry. One of the version numbers can be passed to the data property in order to retrieve that version.' })
  async versions (@Ctx() ctx: Context, @Root() data: Data) {
    const versions = await ctx.svc(VersionedService).listVersions(data.dataId)
    return versions.map(v => new ObjectVersion(v))
  }

  @FieldResolver(returns => DataPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() data: Data) {
    return data
  }

  @Mutation(returns => DataResponse, { description: 'Create a new data entry.' })
  async createDataEntry (@Ctx() ctx: Context, @Arg('args', type => CreateDataInput) args: CreateDataInput) {
    return await ctx.svc(DataService).create(args)
  }

  @Mutation(returns => DataResponse)
  async renameDataEntry (@Ctx() ctx: Context, @Arg('dataId') dataId: string, @Arg('name') name: string) {
    return await ctx.svc(DataService).rename(dataId, name)
  }

  @Mutation(returns => DataResponse, { description: 'Update a data entry.' })
  async updateDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string, @Arg('args', type => UpdateDataInput) args: UpdateDataInput) {
    return await ctx.svc(DataService).update(dataId, args)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Mark the latest version of a data entry "published."' })
  async publishDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string) {
    return await ctx.svc(DataService).publish(dataId)
  }

  @Mutation(returns => DataResponse, { description: 'Remove "published" tag from data entry' })
  async unpublishDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string) {
    return await ctx.svc(DataService).unpublish(dataId)
  }

  @Mutation(returns => DataResponse, { description: 'Move data entry into or out of a folder or change display order. Data may only be moved into a folder containing data that uses its template.' })
  async moveDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => DataResponse)
  async deleteDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string) {
    return await ctx.svc(DataService).delete(dataId)
  }

  @Mutation(returns => DataResponse)
  async undeleteDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string) {
    return await ctx.svc(DataService).undelete(dataId)
  }
}

@Resolver(of => DataPermissions)
export class DataPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may update this data but not necessarily move it.' })
  async update (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayUpdate(data)
  }

  @FieldResolver(returns => Boolean, { description: 'User may publish this data entry either for the first time or to the latest version.' })
  async publish (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayPublish(data)
  }

  @FieldResolver(returns => Boolean, { description: 'User may unpublish this data entry. Returns false when already unpublished.' })
  async unpublish (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayUnpublish(data)
  }

  @FieldResolver(returns => Boolean, { description: 'User may move this data beneath a folder for which they have the `create` permission.' })
  async move (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayMove(data)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this data.' })
  async delete (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayDelete(data)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this data. Returns false when the data is not deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataService).mayUndelete(data)
  }
}
