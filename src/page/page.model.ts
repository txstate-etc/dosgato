import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'
import { PagetreeType } from '../pagetree'

@ObjectType({ description: 'Sites contain pages. Each page can have subpages. Each pagetree has one root page.' })
export class Page {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this page.' })
  id: string

  @Field({ description: 'Page names are used to construct the URL path to each page.' })
  name: UrlSafeString

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

  deletedBy?: number
  pagetreeId: string
  path: string
  pathSplit: number[]
  displayOrder: number
  parentInternalId?: number
  dataId: string

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.dataId
    this.name = row.name
    this.pagetreeId = String(row.pagetreeId)
    this.path = row.path
    this.pathSplit = row.path.split(/\//).filter(isNotBlank).map(Number)
    this.parentInternalId = this.pathSplit[this.pathSplit.length - 1]
    this.displayOrder = row.displayOrder
    this.dataId = row.dataId
    this.linkId = row.linkId
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
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

  @Field(type => [String], { nullable: true, description: 'Return pages with the given paths inside their pagetree, regardless of which site or pagetree. For instance, "/about" could return the about page for dozens of sites. Combine with site or pagetree filters for best results.' })
  paths?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages referenced by the given launched URLs (e.g. "http://history.example.edu/about" points to "/about" inside the history site). Only returns pages from the primary pagetree. Protocol (http/https) may or may not be present but will be ignored if present.' })
  launchedUrls?: string[]

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that have been published. Implies filter activePagetree -> true.' })
  published?: boolean

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that are published, in the active pagetree, and on a launched site.' })
  live?: boolean

  @Field(type => Boolean, { nullable: true, description: 'true -> return only deleted pages, false -> return only nondeleted pages, undefined -> return all pages' })
  deleted?: boolean
}

@InputType()
export class CreatePageInput {
  @Field()
  name!: string

  @Field(type => ID, { description: 'The existing page that will be the new page\'s parent (or sibling, see "above" property).' })
  targetId!: string

  @Field({ nullable: true, description: 'When true, the page will be created above the targeted page instead of inside it.' })
  above?: boolean

  @Field(type => ID, { description: 'All pages must have a template, so we need it upon creation. Further page data will be set later by the page template\'s dialog.' })
  templateKey!: string
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
export class PageLinkInput {
  @Field()
  linkId!: string

  @Field()
  siteId!: string

  @Field()
  path!: string
}
