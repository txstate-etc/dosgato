import { ComponentData, PageData } from '@dosgato/templating'
import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { get, isNull } from 'txstate-utils'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Int, Mutation, ID } from 'type-graphql'
import {
  Pagetree, Role, JsonData, Site, Template, TemplateFilter,
  User, UserService, ObjectVersion, VersionedService, Page, PageFilter, PagePermission, PagePermissions,
  PageResponse, PagesResponse, PageService, RoleService, TemplateService, UrlSafeString,
  DeleteStateInput, PagetreeServiceInternal, PageRuleServiceInternal, SchemaVersionScalar, SiteServiceInternal, VersionFilter,
  UserTag, TagService, getPageLinks
} from '../internal.js'

@Resolver(of => Page)
export class PageResolver {
  @Query(returns => [Page])
  async pages (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: PageFilter) {
    return await ctx.svc(PageService).find({ ...filter, deleteStates: filter?.deleteStates ?? [DeleteStateInput.NOTDELETED, DeleteStateInput.MARKEDFORDELETE] })
  }

  @FieldResolver(returns => User, { nullable: true, description: 'Null when the page is not in the soft-deleted state.' })
  async deletedBy (@Ctx() ctx: Context, @Root() page: Page) {
    if (isNull(page.deletedBy)) return null
    else return await ctx.svc(UserService).findByInternalId(page.deletedBy)
  }

  @FieldResolver(returns => [Page])
  async children (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('recursive', { nullable: true }) recursive?: boolean,
    @Arg('filter', { nullable: true }) filter?: PageFilter
  ) {
    return await ctx.svc(PageService).getPageChildren(page, recursive, filter)
  }

  @FieldResolver(returns => Page, { nullable: true, description: 'Returns null when current page is the root page of a pagetree.' })
  async parent (@Ctx() ctx: Context, @Root() page: Page) {
    if (isNull(page.parentInternalId)) return null
    else return await ctx.svc(PageService).findByInternalId(page.parentInternalId)
  }

  @FieldResolver(returns => Page, { description: 'May return itself when page is already the root page.' })
  async rootpage (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).getRootPage(page)
  }

  @FieldResolver(returns => [Page], { description: 'Starts with the root page and proceeds downward. Last element will be the page\'s parent. Empty array if current page is the root page of a pagetree.' })
  async ancestors (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).getPageAncestors(page)
  }

  @FieldResolver(returns => String)
  path (@Ctx() ctx: Context, @Root() page: Page) {
    return page.resolvedPath
  }

  @FieldResolver(returns => Template, { nullable: true })
  async template (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(TemplateService).findByKey(page.templateKey)
  }

  @FieldResolver(returns => Pagetree)
  async pagetree (@Ctx() ctx: Context, @Root() page: Page) {
    // intentionally skip authz for performance - if you can see a page you can see its pagetree
    return await ctx.svc(PagetreeServiceInternal).findById(page.pagetreeId)
  }

  @FieldResolver(returns => Site)
  async site (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(SiteServiceInternal).findById(String(page.siteInternalId))
  }

  @FieldResolver(returns => JsonData, { description: 'This is a JSON object that represents everything the editor has created on this page. It is up to the rendering code of the page template and all the component templates to turn this data into an HTML page.' })
  async data (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('published', { nullable: true, description: 'Return the published version of the data. When true, version arg is ignored. Throws when there is no published version.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true, description: 'Return the specified version of the data. Ignored when published arg is true. Default is latest and may fail if user has improper permissions.' }) version?: number,
    @Arg('schemaversion', { nullable: true, description: 'Specify the preferred schema version. The API will perform any necessary migrations on the data prior to return. Default is the latest schemaversion.' }) schemaversion?: DateTime
  ) {
    return await ctx.svc(PageService).getData(page, version, published, schemaversion)
  }

  @FieldResolver(returns => [String], { description: 'Returns a list of all the external URLs this page links to. This does not include internal links to other pages and assets within the same system. Will be slow for more than a couple dozen pages.' })
  async externalLinks (@Ctx() ctx: Context, @Root() page: Page, @Arg('published', { nullable: true, description: 'Return links on the published version of the page. If null or false, returns links on the unpublished version.' }) published?: boolean) {
    const data = await ctx.svc(PageService).getData(page, undefined, published)
    return Array.from(new Set((getPageLinks(data).filter(l => l.type === 'url').map(l => l.url))))
  }

  @FieldResolver(returns => JsonData, { nullable: true, description: 'Accepts a dot-separated path identifying data you need and returns only the data it points to. Compared to `data`, this can help avoid transferring a lot of unnecessary bytes if you only need a specific page property.' })
  async dataByPath (@Ctx() ctx: Context, @Root() page: Page,
    @Arg('paths', type => [String]) paths: string[],
    @Arg('published', { nullable: true, description: 'Return the published version of the data. When true, version arg is ignored. Throws when there is no published version.' }) published?: boolean,
    @Arg('version', type => Int, { nullable: true, description: 'Return the specified version of the data. Ignored when published arg is true. Default is latest and may fail if user has improper permissions.' }) version?: number,
    @Arg('schemaversion', { nullable: true, description: 'Specify the preferred schema version. The API will perform any necessary migrations on the data prior to return. Default is the latest schemaversion.' }) schemaversion?: DateTime
  ) {
    if (!paths.length) return {}
    const data = await ctx.svc(PageService).getData(page, version, published, schemaversion)
    return paths.reduce<Record<string, any>>((ret, path) => { ret[path] = get(data, path); return ret }, {})
  }

  @FieldResolver(returns => [String], { description: 'Returns a list of all the tags this page was given by its page template\'s getTags function.' })
  async tags (@Ctx() ctx: Context, @Root() page: Page, @Arg('published', { nullable: true, description: 'Show tags for the published version of the page instead of the latest version.' }) published?: boolean) {
    return await ctx.svc(PageService).getTags(page, published)
  }

  @FieldResolver(returns => [UserTag], { description: 'Returns a list of all the tags this page was assigned directly by an editor. Completely separate set of tags from Page.tags, the tags are managed independently as data.' })
  async userTags (@Ctx() ctx: Context, @Root() page: Page, @Arg('includeDisabled', { nullable: true, description: 'true -> return all groups, false/null -> return only enabled groups' }) includeDisabled?: boolean, @Arg('includeInternal', { nullable: true, description: 'true -> return all tags, false/null -> return only public tags' }) includeInternal?: boolean) {
    return await ctx.svc(TagService).findTagsByPage(page, includeDisabled, includeInternal)
  }

  @FieldResolver(returns => [Template], { description: 'All templates that are approved for use on this page or by the authenticated user.' })
  async templates (@Ctx() ctx: Context, @Root() page: Page, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    return await ctx.svc(PageService).getApprovedTemplates(page, filter)
  }

  @FieldResolver(returns => DateTime)
  async createdAt (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).getMeta(page.intDataId)
    return DateTime.fromJSDate(data!.created)
  }

  @FieldResolver(returns => User)
  async createdBy (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).getMeta(page.intDataId)
    return await ctx.svc(UserService).findById(data!.createdBy)
  }

  @FieldResolver(returns => DateTime, { description: 'Date page was last modified. May be used to determine whether page has been modified since being published: (page.published && page.modifiedAt > page.publishedAt).' })
  async modifiedAt (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).getMeta(page.intDataId)
    return DateTime.fromJSDate(data!.modified)
  }

  @FieldResolver(returns => User)
  async modifiedBy (@Ctx() ctx: Context, @Root() page: Page) {
    const data = await ctx.svc(VersionedService).getMeta(page.intDataId)
    return await ctx.svc(UserService).findById(data!.modifiedBy)
  }

  @FieldResolver(returns => Boolean, { description: 'True if the page has a version marked as published. Note that the page could be published but not in the currently active pagetree.' })
  published (@Ctx() ctx: Context, @Root() page: Page) {
    return page.published
  }

  @FieldResolver(returns => Boolean, { description: 'True if versions of this page have been added since it was last published. Also true if page is currently unpublished.' })
  async hasUnpublishedChanges (@Ctx() ctx: Context, @Root() page: Page) {
    const tags = await ctx.svc(VersionedService).getCurrentTags(page.intDataId)
    return !tags.some(t => t.tag === 'published')
  }

  @FieldResolver(returns => Boolean, { description: 'True if the page is published, part of the active pagetree, and on a site that is currently launched.' })
  async live (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).isLive(page)
  }

  @FieldResolver(returns => DateTime, { nullable: true, description: 'Null if the page has never been published, but could have a value. ' })
  async publishedAt (@Ctx() ctx: Context, @Root() page: Page) {
    const tag = await ctx.svc(VersionedService).getTag(page.intDataId, 'published')
    if (!tag) return null
    return DateTime.fromJSDate(tag.date)
  }

  @FieldResolver(returns => User, { nullable: true })
  async publishedBy (@Ctx() ctx: Context, @Root() page: Page) {
    const tag = await ctx.svc(VersionedService).getTag(page.intDataId, 'published')
    if (!tag) return null
    return await ctx.svc(UserService).findById(tag.user)
  }

  @FieldResolver(returns => [Role], { description: 'Returns a list of all roles with at least one of the specified permissions on this page, or any permission if null.' })
  async roles (@Ctx() ctx: Context, @Root() page: Page, @Arg('withPermission', type => [PagePermission], { nullable: true }) withPermission?: PagePermission[]) {
    let rules = await ctx.svc(PageRuleServiceInternal).findByPage(page)
    if (withPermission) rules = rules.filter(r => withPermission.some(p => r.grants[p]))
    return await ctx.svc(RoleService).findByIds(rules.map(r => r.roleId))
  }

  @FieldResolver(returns => [ObjectVersion], { description: 'Returns a list of all old versions of this page in reverse order (latest version at position 0). One of the version numbers can be passed to the data property in order to retrieve that version of the data.' })
  async versions (@Ctx() ctx: Context, @Root() page: Page, @Arg('filter', { nullable: true }) filter?: VersionFilter) {
    const versions = await ctx.svc(VersionedService).listVersions(page.intDataId, filter)
    return versions.map(v => new ObjectVersion(v))
  }

  @FieldResolver(returns => ObjectVersion, { description: 'Returns the latest version information for the page.' })
  async version (@Ctx() ctx: Context, @Root() page: Page) {
    const [versioned, tags] = await Promise.all([
      ctx.svc(VersionedService).getMeta(page.intDataId),
      ctx.svc(VersionedService).getCurrentTags(page.intDataId)
    ])
    if (!versioned) throw new Error('Tried to retrieve version for a page that does not exist.')
    return new ObjectVersion({
      id: versioned.id,
      version: versioned.version,
      date: versioned.modified,
      comment: versioned.comment,
      tags: tags.map(t => t.tag),
      user: versioned.modifiedBy
    })
  }

  @FieldResolver(returns => PagePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() page: Page) {
    return page
  }

  // Mutations
  @Mutation(returns => PageResponse, { description: 'Create a new page.' })
  async createPage (@Ctx() ctx: Context,
    @Arg('name') name: UrlSafeString,
    @Arg('data', type => JsonData, { description: "Page data after the user has saved the page properties dialog. Data should include templateKey and the admin UI's schemaVersion.\n\nNote that the mutation will fail if any content is provided underneath 'areas' - pages must be created empty." }) data: PageData,
    @Arg('targetId', type => ID, { description: "An existing page to be the new page's parent or sibling, depending on the 'above' arg." }) targetId: string,
    @Arg('above', { nullable: true, description: 'When true, the page will be created above the target page instead of inside it.' }) above?: boolean,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).createPage(name as string, data, targetId, above, validateOnly)
  }

  @Mutation(returns => PageResponse)
  async updatePage (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('data', type => JsonData, { description: 'The full page data which should include the appropriate schemaVersion.' }) data: PageData,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).updatePage(pageId, dataVersion, data, comment, validateOnly)
  }

  @Mutation(returns => PageResponse)
  async restorePage (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('restoreVersion', type => Int) restoreVersion: number,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return a validation response indicating whether the restoration will be possible.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).restorePage(pageId, restoreVersion, validateOnly)
  }

  @Mutation(returns => PageResponse, { description: 'Update only one component on a page. Validation will only cover the inserted data and validation failures in other components will not cause the mutation to fail. This is in contrast to updatePage where the full page must validate in order to be accepted.' })
  async updatePageProperties (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('schemaversion', type => SchemaVersionScalar, { description: 'The schemaversion of the page being edited. This will have been upgraded to match the schemaversion requested when retrieving the data. The mutation cannot determine this for itself.' }) schemaversion: DateTime,
    @Arg('data', type => JsonData, { description: 'The new component data. Cannot add or update child components in any of its areas. If it includes an `areas` property, it will be ignored.' }) data: ComponentData,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).updatePageProperties(pageId, dataVersion, schemaversion, data, comment, validateOnly)
  }

  @Mutation(returns => PageResponse, { description: 'Update only one component on a page. Validation will only cover the inserted data and validation failures in other components will not cause the mutation to fail. This is in contrast to updatePage where the full page must validate in order to be accepted.' })
  async updatePageComponent (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('schemaversion', type => SchemaVersionScalar, { description: 'The schemaversion of the page being edited. This will have been upgraded to match the schemaversion requested when retrieving the data. The mutation cannot determine this for itself.' }) schemaversion: DateTime,
    @Arg('path', { description: 'The dot-separated path within the page to the component being edited. e.g. `areas.main.1.areas.content.1`' }) path: string,
    @Arg('data', type => JsonData, { description: 'The new component data. Cannot add or update child components in any of its areas. If it includes an `areas` property, it will be ignored.' }) data: ComponentData,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).updateComponent(pageId, dataVersion, schemaversion, path, data, comment, validateOnly)
  }

  @Mutation(returns => PageResponse, { description: 'Add one component to a page. Validation will only cover the inserted data and validation failures in other components will not cause the mutation to fail. This is in contrast to updatePage where the full page must validate in order to be accepted.' })
  async createPageComponent (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('schemaversion', type => SchemaVersionScalar, { description: 'The schemaversion of the page being edited. This will have been upgraded to match the schemaversion requested when retrieving the data. The mutation cannot determine this for itself.' }) schemaversion: DateTime,
    @Arg('path', { description: 'The dot-separated path within the page to the area being appended (e.g. `areas.main.1.areas.content`) OR the insert location if inserting above another component (e.g. `areas.main.1.areas.content.0`).' }) path: string,
    @Arg('data', type => JsonData, { description: 'The new component data. Cannot add or update child components in any of its areas. If it includes an `areas` property, it will be ignored.' }) data: ComponentData,
    @Arg('isCopy', { nullable: true, description: 'Set this when the data being inserted was copied from an existing component. It\'s important because the existing data needs to be processed to do things like regenerate unique identifiers.' }) isCopy?: boolean,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean,
    @Arg('addToTop', { nullable: true, description: 'When true, the mutation will make the new component the first in its area.' }) addToTop?: boolean
  ) {
    return await ctx.svc(PageService).addComponent(pageId, dataVersion, schemaversion, path, data, isCopy, comment, validateOnly, addToTop)
  }

  @Mutation(returns => PageResponse, { description: 'Move one component to another area within a page. No validation happens aside from legal template placement, so validation failures will not cause the mutation to fail. This is in contrast to updatePage where the full page must validate in order to be accepted.' })
  async movePageComponent (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('schemaversion', type => SchemaVersionScalar, { description: 'The schemaversion of the page being edited. This will have been upgraded to match the schemaversion requested when retrieving the data. The mutation cannot determine this for itself.' }) schemaversion: DateTime,
    @Arg('fromPath', { description: 'The dot-separated path within the page to the component being moved. e.g. `areas.main.1.areas.content`' }) fromPath: string,
    @Arg('toPath', { description: 'The dot-separated path within the page to the new location. This may include the desired index in the new array so that ordering is preserved (e.g. `areas.main.1.areas.content.1`), or it may just specify an area (e.g. `areas.main.1.areas.content`) and it will be appended to the end.' }) toPath: string,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string
  ) {
    return await ctx.svc(PageService).moveComponent(pageId, dataVersion, schemaversion, fromPath, toPath, comment)
  }

  @Mutation(returns => PageResponse, { description: 'Delete one component from a page. No validation is necessary, so validation failures in other components will not cause the mutation to fail. This is in contrast to updatePage where the full page must validate in order to be accepted.' })
  async deletePageComponent (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('dataVersion', type => Int, {
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion: number,
    @Arg('schemaversion', type => SchemaVersionScalar, { description: 'The schemaversion of the page being edited. This will have been upgraded to match the schemaversion requested when retrieving the data. The mutation cannot determine this for itself.' }) schemaversion: DateTime,
    @Arg('path', { description: 'The dot-separated path within the page to the component being deleted. e.g. `areas.main.1.areas.content.1`' }) path: string,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string
  ) {
    return await ctx.svc(PageService).deleteComponent(pageId, dataVersion, schemaversion, path, comment)
  }

  @Mutation(returns => PageResponse, { description: 'Change the template of a page.' })
  async changePageTemplate (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('templateKey', { description: 'The new templateKey for the page.' }) templateKey: string,
    @Arg('dataVersion', type => Int, {
      nullable: true,
      description: "When a user begins editing a page, they view the latest version and begin making changes. If time passes, it's possible there will be a new version in the database by the time the editor saves. We pass along the version that the editor thinks they are saving against so that we can return an error if it is no longer the latest version."
    }) dataVersion?: number,
    @Arg('comment', { nullable: true, description: 'An optional comment describing the intent behind the update.' }) comment?: string,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal. Use this to validate user input as they type, before they hit Submit.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(PageService).changePageTemplate(pageId, templateKey, dataVersion, comment, validateOnly)
  }

  @Mutation(returns => PageResponse)
  async renamePage (@Ctx() ctx: Context,
    @Arg('pageId', type => ID) pageId: string,
    @Arg('name') name: UrlSafeString,
    @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(PageService).renamePage(pageId, name as string, validateOnly)
  }

  @Mutation(returns => PagesResponse)
  async movePages (@Ctx() ctx: Context,
    @Arg('pageIds', type => [ID]) pageIds: string[],
    @Arg('targetId', type => ID) targetId: string,
    @Arg('above', { nullable: true, description: 'When true, page(s) will be moved above the targeted page, rather than inside it.' }) above: boolean
  ) {
    return await ctx.svc(PageService).movePages(pageIds, targetId, above)
  }

  @Mutation(returns => PageResponse)
  async copyPages (@Ctx() ctx: Context,
    @Arg('pageIds', type => [ID]) pageIds: string[],
    @Arg('targetId', type => ID) targetId: string,
    @Arg('above', { nullable: true, description: 'When true, page(s) will be copied above the targeted page, rather than inside it.' }) above: boolean,
    @Arg('includeChildren', type => Boolean, { nullable: true, description: 'If true, restore the child pages of these pages too.' }) includeChildren: boolean
  ) {
    return await ctx.svc(PageService).copyPages(pageIds, targetId, above, includeChildren)
  }

  @Mutation(returns => ValidatedResponse)
  async publishPages (@Ctx() ctx: Context, @Arg('pageIds', type => [ID]) pageIds: string[], @Arg('includeChildren', type => Boolean, { nullable: true, description: 'If true, publish the child pages of these pages too.' }) includeChildren?: boolean) {
    return await ctx.svc(PageService).publishPages(pageIds, includeChildren)
  }

  @Mutation(returns => ValidatedResponse)
  async unpublishPages (@Ctx() ctx: Context, @Arg('pageIds', type => [ID]) pageIds: string[]) {
    return await ctx.svc(PageService).unpublishPages(pageIds)
  }

  @Mutation(returns => PagesResponse)
  async deletePages (@Ctx() ctx: Context, @Arg('pageIds', type => [ID]) pageIds: string[]) {
    return await ctx.svc(PageService).deletePages(pageIds)
  }

  @Mutation(returns => PagesResponse)
  async publishPageDeletions (@Ctx() ctx: Context, @Arg('pageIds', type => [ID]) pageIds: string[]) {
    return await ctx.svc(PageService).publishPageDeletions(pageIds)
  }

  @Mutation(returns => PagesResponse)
  async undeletePages (@Ctx() ctx: Context, @Arg('pageIds', type => [ID]) pageIds: string[], @Arg('includeChildren', type => Boolean, { nullable: true, description: 'If true, restore the child pages of these pages too.' }) includeChidren?: boolean) {
    return await ctx.svc(PageService).undeletePages(pageIds, includeChidren)
  }
}

@Resolver(of => PagePermissions)
export class PagePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may view the latest unpublished version of this page. Published pages are completely public.' })
  viewLatest (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayViewLatest(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may update this page but not necessarily move or publish it.' })
  update (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayUpdate(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may rename this page or move it beneath a page for which they have the `create` permission.' })
  move (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayMove(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may create or move pages beneath this page.' })
  create (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayCreate(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may publish this page either for the first time or to the latest version.' })
  async publish (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).mayPublish(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may unpublish this page. Returns false when the page is already unpublished.' })
  async unpublish (@Ctx() ctx: Context, @Root() page: Page) {
    return await ctx.svc(PageService).mayUnpublish(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may soft-delete this page.' })
  delete (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayDelete(page)
  }

  @FieldResolver(returns => Boolean, { description: 'User may undelete this page. Returns false when the page is not deleted.' })
  undelete (@Ctx() ctx: Context, @Root() page: Page) {
    return ctx.svc(PageService).mayUndelete(page)
  }
}
