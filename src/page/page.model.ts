import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { isBlank, isNotBlank, isNotNull, titleCase } from 'txstate-utils'
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString, PagetreeType, UrlSafePath } from '../internal.js'

export enum DeleteState {
  NOTDELETED = 0,
  MARKEDFORDELETE = 1,
  DELETED = 2
}

registerEnumType(DeleteState, {
  name: 'DeleteState',
  description: 'Determine whether a page is deleted, marked for deletion, or not deleted.',
  valuesConfig: {
    NOTDELETED: { description: 'Has not been deleted' },
    MARKEDFORDELETE: { description: 'Has been deleted, but the deletion has not been published. Will still be visible on live site.' },
    DELETED: { description: 'Has been deleted and the deletion has been published' }
  }
})

export enum DeleteStateInput {
  NOTDELETED = 0,
  MARKEDFORDELETE = 1,
  DELETED = 2,
  ORPHAN_NOTDELETED = 3,
  ORPHAN_MARKEDFORDELETE = 4,
  ORPHAN_DELETED = 5,
  ALL = 6
}
export const DeleteStateRootDefault = [DeleteStateInput.NOTDELETED, DeleteStateInput.MARKEDFORDELETE]
export const DeleteStateDefault = [DeleteStateInput.NOTDELETED, DeleteStateInput.MARKEDFORDELETE, DeleteStateInput.ORPHAN_NOTDELETED, DeleteStateInput.ORPHAN_MARKEDFORDELETE]
export const DeleteStateAll = [DeleteStateInput.NOTDELETED, DeleteStateInput.MARKEDFORDELETE, DeleteStateInput.DELETED, DeleteStateInput.ORPHAN_NOTDELETED, DeleteStateInput.ORPHAN_MARKEDFORDELETE, DeleteStateInput.ORPHAN_DELETED]

registerEnumType(DeleteStateInput, {
  name: 'DeleteStateInput',
  description: 'Filter for whether an object is deleted, marked for deletion, or not deleted. Also filter for objects that have been orphaned. Default is typically [NOTDELETED, MARKEDFORDELETE] for root queries and [NOTDELETED, MARKEDFORDELETE, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE] for relations.',
  valuesConfig: {
    NOTDELETED: { description: 'Objects that have not been deleted and are not orphaned.' },
    MARKEDFORDELETE: { description: 'Has been deleted, but the deletion has not been finalized. Generally objects become unpublished and disappear from public view when they are marked for deletion. Also is not an orphan.' },
    DELETED: { description: 'Has been deleted and the deletion has been finalized. Also is not an orphan.' },
    ORPHAN_NOTDELETED: { description: 'Not specifically deleted by a user, but belongs to a parent object, like a site or pagetree, which has been deleted.' },
    ORPHAN_MARKEDFORDELETE: { description: 'Marked as pending deletion by a user, but also belongs to a parent object, like a site or pagetree, which has been deleted.' },
    ORPHAN_DELETED: { description: 'Specifically deleted by a user, but also belongs to a parent object, like a site or pagetree, which has been deleted.' },
    ALL: { description: 'Supercedes all the other filters. Essentially disables the filter, which is useful because this filter is generally enabled by default.' }
  }
})

@ObjectType({ description: 'Sites contain pages. Each page can have subpages. Each pagetree has one root page.' })
export class Page {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this page.' })
  id: string

  @Field(type => UrlSafeString, { description: 'Page names are used to construct the URL path to each page.' })
  name: string

  @Field({
    description: 'Use linkId to construct an internal link. When a page is ' +
      'copied from one pagetree to another, the linkId remains the same, preventing ' +
      'other site\'s links from breaking upon promoting a pagetree to live.\n\n' +
      'When resolving a link, the page containing the link must be considered. If the ' +
      'containing page and the linkId are in the same site, following the link should ' +
      'stay within that pagetree (or be a broken link if the linkId does not exist in ' +
      'the SAME pagetree). Otherwise, following the link should go to the active pagetree.\n\n' +
      'When copying a page from one site to another, the linkId should be scrambled ' +
      'instead of retained, so that no linkId exists in more than one site at a time.'
  })
  linkId: string

  @Field({ description: 'Page has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this page was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  @Field({ description: 'Indicates whether this page is undeleted, marked for deletion, or deleted.' })
  deleteState: DeleteState

  @Field({ nullable: true, description: '`title` is how the editor titled the page, and is allowed to be null. Use `fallbackTitle` instead to guarantee a value (if the user did not enter a title, one will be generated based on the page name).' })
  title: string

  @Field({ description: '`title` is how the editor titled the page, and is allowed to be null. Use `fallbackTitle` instead to guarantee a value (if the user did not enter a title, one will be generated based on the page name).' })
  get fallbackTitle () {
    return isBlank(this.title) ? titleCase(this.name) : this.title
  }

  deletedBy?: number
  pagetreeId: string
  path: string
  pathSplit: number[]
  displayOrder: number
  parentInternalId?: number
  dataId: string
  pathAsParent: string
  siteInternalId: number
  templateKey: string

  // this is a helper property for determining whether templates can be kept on a page
  // see TemplateService.mayKeepOnPage()
  existingTemplateKeys?: Set<string>

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.dataId
    this.name = row.name
    this.pagetreeId = String(row.pagetreeId)
    this.siteInternalId = row.siteId
    this.title = row.title
    this.templateKey = row.templateKey
    this.path = row.path
    this.pathSplit = row.path.split(/\//).filter(isNotBlank).map(Number)
    this.parentInternalId = this.pathSplit[this.pathSplit.length - 1]
    this.pathAsParent = '/' + [...this.pathSplit, this.internalId].join('/')
    this.displayOrder = row.displayOrder
    this.dataId = row.dataId
    this.linkId = row.linkId
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = row.deletedAt ? DateTime.fromJSDate(row.deletedAt) : undefined
    this.deletedBy = row.deletedBy
    this.deleteState = row.deleteState
  }
}

@InputType()
export class PageFilter {
  internalIds?: number[]
  internalIdPaths?: string[]
  internalIdPathsRecursive?: string[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages with the given link ids.' })
  linkIds?: string[]

  @Field(type => [PageLinkInput], { nullable: true, description: 'Resolve page links preferring linkId and falling back to path.' })
  links?: PageLinkInput[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that belong to any of the given pagetree ids.' })
  pagetreeIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that belong to any of the given sites.' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages using any of the given templates. These could be page templates or component templates.' })
  templateKeys?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages that contain a link to any of the given link ids.' })
  linkIdsReferenced?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages referenced (linked to) by any of the given pages.' })
  referencedByPageIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that contain a link to any of the given assets.' })
  assetKeysReferenced?: string[]

  @Field(type => [PagetreeType], { nullable: true, description: 'Only return pages in the pagetrees of their site with the types specified' })
  pagetreeTypes?: PagetreeType[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return pages with the given paths, regardless of which pagetree. For instance, "/site1/about" could return the about page for the primary pagetree in addition to the sandbox. Combine with pagetree filters for best results.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return pages that descend from any of the given paths. The path behavior is identical to the `paths` filter, so combine with pagetree filters for best results.' })
  beneath?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return pages that are direct children of any of the given paths. The path behavior is identical to the `paths` filter, so combine with pagetree filters for best results.' })
  parentPaths?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages referenced by the given launched URLs (e.g. "http://history.example.edu/about" points to "/about" inside the history site). Only returns pages from the primary pagetree. Protocol (http/https) may or may not be present but will be ignored if present.' })
  launchedUrls?: string[]

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that have been published. Implies filter activePagetree -> true.' })
  published?: boolean

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that are published, in the active pagetree, and on a launched site.' })
  live?: boolean

  @Field(type => [DeleteStateInput], { nullable: true, description: 'Return based on deleted status. If you do not specify this filter it will still hide deleted and orphaned by default but show those that are marked for deletion. Orphaned refers to the situation where an object is effectively deleted because it belongs to a site, pagetree, or parent that has been deleted.' })
  deleteStates?: DeleteStateInput[]

  @Field(type => Int, { nullable: true, description: 'Only return pages at a depth less than or equal to maxDepth. Root page is 0 depth.' })
  maxDepth?: number

  @Field(type => [ID], { nullable: true, description: 'Only return pages matching one of the given legacy IDs. Legacy IDs are set when migrating content from another system and may be used to help determine if the content has been previously moved.' })
  legacyIds?: string[]
}

@ObjectType()
export class PageResponse extends ValidatedResponse {
  @Field({ nullable: true })
  page?: Page

  constructor (config?: ValidatedResponseArgs & { page?: Page }) {
    super(config ?? {})
    this.page = config?.page
  }
}

@ObjectType()
export class PagesResponse extends ValidatedResponse {
  @Field(type => [Page])
  pages: Page[]

  constructor (config?: ValidatedResponseArgs & { pages?: Page[] }) {
    super(config ?? {})
    this.pages = config?.pages ?? []
  }
}

@ObjectType()
export class PagePermissions {}

export enum PagePermission {
  VIEWLATEST = 'viewlatest',
  UPDATE = 'update',
  MOVE = 'move',
  CREATE = 'create',
  PUBLISH = 'publish',
  UNPUBLISH = 'unpublish',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(PagePermission, {
  name: 'PagePermission',
  description: 'All the action types that can be individually permissioned on a page.'
})

@InputType()
export class LinkInputContext {
  @Field(type => ID)
  pagetreeId!: string
}

@InputType()
export class PageLinkInput {
  @Field(type => ID)
  siteId!: string

  @Field()
  linkId!: string

  @Field()
  path!: string

  @Field(type => LinkInputContext, { nullable: true, description: 'Context information for where this link was placed. If the link is on a sandbox page, for instance, we would want to look up this link in the sandbox pagetree instead of the main pagetree. If no context is specified, links will only be found in the PRIMARY pagetree.' })
  context?: LinkInputContext
}

// TODO: Move this enum somewhere else. utils?
export enum DeletedFilter {
  SHOW = 'show', // show all
  ONLY = 'only', // show only deleted
  HIDE = 'hide' // show only non-deleted
}

registerEnumType(DeletedFilter, {
  name: 'DeletedFilter',
  description: 'Options for the deleted filter',
  valuesConfig: {
    SHOW: { description: 'Return both deleted and undeleted items' },
    ONLY: { description: 'Return only deleted items' },
    HIDE: { description: 'Return only undeleted items' }
  }
})
