import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
export class Page {
  @Field(type => Int)
  id: number

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

  deletedBy: number|null
  pageTreeId: number
  dataId: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.pageTreeId = row.pagetree_id
    this.dataId = row.data_id
    this.linkId = row.link_id
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deleted_by
  }
}

@InputType()
export class PageFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [String], { nullable: true, description: 'Return pages with the given link ids.' })
  linkIds?: string[]

  @Field(type => [Int], { nullable: true })
  siteTreeIds?: number[]

  @Field(type => [Int], { nullable: true })
  parentPageIds?: number[]

  @Field(type => [String], { nullable: true, description: 'Return pages containing at least one component using one of the given templates.' })
  componentTemplates?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages using one of the given page templates.' })
  pageTemplates?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages that contain a link to any of the given link ids.' })
  linkIdsReferenced?: string[]

  @Field(type => [Int], { nullable: true, description: 'Return pages referenced (linked to) by any of the given pages.' })
  referencedByPageIds?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return pages that contain a link to any of the given asset ids.' })
  assetIdsReferenced?: number[]

  @Field(type => Boolean, { nullable: true, description: 'Only return pages in the active pagetree of their site.' })
  activePagetree?: boolean

  @Field(type => Boolean, { nullable: false, description: 'Only return pages that have been published. Implies filter activePagetree -> true.' })
  published?: boolean

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted pages, false -> return only nondeleted pages, undefined -> return all pages' })
  deleted?: boolean
}

@ObjectType()
export class PagePermissions {}
