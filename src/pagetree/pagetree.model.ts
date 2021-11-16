import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

export enum PageTreeType {
  PRIMARY = 'primary',
  SANDBOX = 'sandbox',
  ARCHIVE = 'archive'
}
registerEnumType(PageTreeType, {
  name: 'PageTreeType',
  description: `An indicator of which stage of the lifecycle a page tree represents. Page
  trees are always SANDBOX when first created, become PRIMARY when promoted, and become
  ARCHIVE when some other page tree is promoted and replaces it. When a site is created
  it will always be created with a single PRIMARY pagetree.`,
  valuesConfig: {
    PRIMARY: { description: 'The primary page tree. There will always be exactly one of these per site.' },
    SANDBOX: { description: 'A page tree that is currently being groomed to be the next primary page tree.' },
    ARCHIVE: { description: 'A page tree that used to be the primary page tree.' }
  }
})

@ObjectType({
  description: `A pagetree represents the page hierarchy in a site. Each pagetree begins
    with a single root page. A site may have multiple pagetrees, but only one active pagetree.
    Inactive pagetrees would be archives or sandboxes.`
})
export class PageTree {
  @Field(type => ID)
  id: string

  @Field(type => PageTreeType)
  type: PageTreeType

  @Field()
  name: string

  @Field()
  deleted: boolean

  @Field({ description: 'Date this page tree was created. If it matches the site created date, it is the page tree that was automatically created to be the site\'s PRIMARY.' })
  created: DateTime

  @Field({ nullable: true, description: 'Date this page tree was archived. If an archive is promoted to primary and re-archived, only the last move to archive status is recorded.' })
  archived?: DateTime

  siteId: string
  deletedBy?: number

  constructor (row: any) {
    this.id = String(row.id)
    this.type = row.type
    this.name = row.name
    this.siteId = String(row.siteId)
    this.created = DateTime.fromJSDate(row.createdAt)
    this.archived = row.archived ? DateTime.fromJSDate(row.archived) : undefined
    this.deleted = row.deleted === 1
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class PageTreeFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [PageTreeType], { nullable: true })
  types?: PageTreeType[]
}

@ObjectType()
export class PageTreeResponse extends ValidatedResponse {
  @Field({ nullable: true })
  pagetree?: PageTree

  constructor (config: ValidatedResponseArgs & { pagetree?: PageTree }) {
    super(config)
    this.pagetree = config.pagetree
  }
}

@ObjectType()
export class PageTreePermissions {
}

export enum PageTreePermission {
  RENAME = 'rename',
  PROMOTE = 'promote',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(PageTreePermission, {
  name: 'PageTreePermission',
  description: 'All the action types that can be individually permissioned on a pagetree.'
})
