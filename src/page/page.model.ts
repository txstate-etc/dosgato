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

  @Field({ description: 'Use this id for internal links. These links do not break upon promoting a pagetree to live.' })
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

  @Field(type => [String], { nullable: true })
  componentTemplates?: string[]

  @Field(type => [String], { nullable: true })
  pageTemplates?: string[]

  @Field(type => [String], { nullable: true, description: 'Return pages that contain a link to any of the given link ids.' })
  linkIdsReferenced?: string[]

  @Field(type => [Int], { nullable: true, description: 'Return pages referenced (linked to) by any of the given pages.' })
  referencedByPageIds?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return pages that contain a link to any of the given asset ids.' })
  assetIdsReferenced?: number[]

  @Field(type => Boolean, { nullable: false, description: 'Only return pages that have been published.' })
  published?: boolean

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted pages, false -> return only nondeleted pages, undefined -> return all pages' })
  deleted?: boolean
}

@ObjectType()
export class PagePermissions {}
