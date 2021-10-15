import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType({ description: 'Sites contain pages. Each page can have subpages. Each pagetree has one root page.' })
export class Page {
  @Field(type => ID)
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
  pageTreeId: string
  dataId: string

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    this.pageTreeId = String(row.pagetreeId)
    this.dataId = row.dataId
    this.linkId = row.linkId
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class PageFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages with the given link ids.' })
  linkIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that belong to any of the given pagetree ids.' })
  pageTreeIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that belong to any of the given sites.' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages whose parent page is any of the given page ids.' })
  parentPageIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages using any of the given templates. These could be page templates or component templates.' })
  templateKeys?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages that contain a link to any of the given link ids.' })
  linkIdsReferenced?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages referenced (linked to) by any of the given pages.' })
  referencedByPageIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return pages that contain a link to any of the given assets.' })
  assetKeysReferenced?: string[]

  @Field(type => Boolean, { nullable: true, description: 'Only return pages in the active pagetree of their site.' })
  activePagetree?: boolean

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that have been published. Implies filter activePagetree -> true.' })
  published?: boolean

  @Field(type => Boolean, { nullable: true, description: 'Only return pages that are published, in the active page tree, and on a launched site.' })
  live?: boolean

  @Field(type => Boolean, { nullable: true, description: 'true -> return only deleted pages, false -> return only nondeleted pages, undefined -> return all pages' })
  deleted?: boolean
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
