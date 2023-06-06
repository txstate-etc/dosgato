import type { DataData } from '@dosgato/templating'
import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int, Mutation, ID } from 'type-graphql'
import { isNull, unique } from 'txstate-utils'
import {
  DataFolder, Role, JsonData, Site, Template,
  TemplateService, User, UserService, ObjectVersion, VersionedService, Data,
  DataFilter, DataPermission, DataPermissions, DataService, DataResponse, DataMultResponse,
  CreateDataInput, UpdateDataInput, DataRuleService, RoleService, MoveDataTarget,
  UrlSafeString, DeleteStateRootDefault, SiteServiceInternal, DataFolderServiceInternal,
  DataServiceInternal
} from '../internal.js'

@Resolver(of => Data)
export class DataResolver {
  @Query(returns => [Data], { name: 'data' })
  async dataquery (@Ctx() ctx: Context, @Arg('filter') filter: DataFilter) {
    return await ctx.svc(DataService).find({ ...filter, deleteStates: filter.deleteStates ?? DeleteStateRootDefault })
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
    const versioned = await ctx.svc(VersionedService).get(data.intDataId, { version, tag: published ? 'published' : undefined })
    return versioned!.data
  }

  @FieldResolver(returns => Template, { description: 'Data are created with a template that defines the schema and provides an editing dialog. The template never changes (except as part of an upgrade task).' })
  async template (@Ctx() ctx: Context, @Root() data: Data) {
    const versioned = await ctx.svc(VersionedService).get<DataData>(data.intDataId)
    const templateKey = versioned!.data.templateKey
    return await ctx.svc(TemplateService).findByKey(templateKey)
  }

  @FieldResolver(returns => DataFolder, { nullable: true, description: 'Parent folder containing the data entry. Null if the data exists at the global or site root. In the data area, there is only one level of folders for organization - folders do not contain more folders.' })
  async folder (@Ctx() ctx: Context, @Root() data: Data) {
    if (isNull(data.folderInternalId)) return null
    else return await ctx.svc(DataFolderServiceInternal).findByInternalId(data.folderInternalId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this data entry belongs. Data can be shared across sites, but one site is still the owner. Null if the data is global (not associated with any site).' })
  async site (@Ctx() ctx: Context, @Root() data: Data) {
    if (isNull(data.siteId)) return null
    else return await ctx.svc(SiteServiceInternal).findById(data.siteId)
  }

  @FieldResolver(returns => String)
  async path (@Ctx() ctx: Context, @Root() data: Data) {
    return await ctx.svc(DataServiceInternal).getPath(data)
  }

  @FieldResolver(returns => Boolean, { description: 'True if the data entry has a version marked as published.' })
  async published (@Ctx() ctx: Context, @Root() data: Data) {
    const published = await ctx.svc(VersionedService).get(data.intDataId, { tag: 'published' })
    return (typeof published) !== 'undefined'
  }

  @FieldResolver(returns => DateTime, { nullable: true })
  async publishedAt (@Ctx() ctx: Context, @Root() data: Data) {
    const tag = await ctx.svc(VersionedService).getTag(data.intDataId, 'published')
    if (!tag) return null
    return DateTime.fromJSDate(tag.date)
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.intDataId)
    return DateTime.fromJSDate(dataFromStorage!.created)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.intDataId)
    return await ctx.svc(UserService).findById(dataFromStorage!.createdBy)
  }

  @FieldResolver(returns => DateTime)
  async modifiedAt (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.intDataId)
    return DateTime.fromJSDate(dataFromStorage!.modified)
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() data: Data) {
    const dataFromStorage = await ctx.svc(VersionedService).get(data.intDataId)
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
    const versions = await ctx.svc(VersionedService).listVersions(data.intDataId)
    return versions.map(v => new ObjectVersion(v))
  }

  @FieldResolver(returns => ObjectVersion, { description: 'Returns the latest version information for the data entry.' })
  async version (@Ctx() ctx: Context, @Root() data: Data) {
    const [versioned, tags] = await Promise.all([
      ctx.svc(VersionedService).get(data.intDataId),
      ctx.svc(VersionedService).getCurrentTags(data.intDataId)
    ])
    if (!versioned) throw new Error('Tried to retrieve version for a data entry that does not exist.')
    return new ObjectVersion({
      id: versioned.id,
      version: versioned.version,
      date: versioned.modified,
      comment: versioned.comment,
      tags: tags.map(t => t.tag),
      user: versioned.modifiedBy
    })
  }

  @FieldResolver(returns => DataPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() data: Data) {
    return data
  }

  @Mutation(returns => DataResponse, { description: 'Create a new data entry.' })
  async createDataEntry (@Ctx() ctx: Context, @Arg('args', type => CreateDataInput) args: CreateDataInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(DataService).create(args, validateOnly)
  }

  @Mutation(returns => DataResponse, { description: 'Update a data entry.' })
  async updateDataEntry (@Ctx() ctx: Context, @Arg('dataId', type => ID) dataId: string, @Arg('args', type => UpdateDataInput) args: UpdateDataInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(DataService).update(dataId, args, validateOnly)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Mark the latest version of data entries "published."' })
  async publishDataEntries (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[]) {
    return await ctx.svc(DataService).publish(dataIds)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove "published" tag from data entries' })
  async unpublishDataEntries (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[]) {
    return await ctx.svc(DataService).unpublish(dataIds)
  }

  @Mutation(returns => DataMultResponse, { description: 'Move data entries into or out of a folder or change display order. Data may only be moved into a folder containing data that uses its template.' })
  async moveDataEntries (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[], @Arg('target', type => MoveDataTarget) target: MoveDataTarget) {
    return await ctx.svc(DataService).move(dataIds, target)
  }

  @Mutation(returns => DataMultResponse)
  async deleteDataEntries (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[]) {
    return await ctx.svc(DataService).delete(dataIds)
  }

  @Mutation(returns => DataMultResponse)
  async publishDataEntryDeletions (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[]) {
    return await ctx.svc(DataService).publishDataEntryDeletions(dataIds)
  }

  @Mutation(returns => DataMultResponse)
  async undeleteDataEntries (@Ctx() ctx: Context, @Arg('dataIds', type => [ID]) dataIds: string[]) {
    return await ctx.svc(DataService).undelete(dataIds)
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
