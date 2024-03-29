import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

export enum PagetreeType {
  PRIMARY = 'primary',
  SANDBOX = 'sandbox',
  ARCHIVE = 'archive'
}
registerEnumType(PagetreeType, {
  name: 'PagetreeType',
  description: `An indicator of which stage of the lifecycle a pagetree represents. Page
  trees are always SANDBOX when first created, become PRIMARY when promoted, and become
  ARCHIVE when some other pagetree is promoted and replaces it. When a site is created
  it will always be created with a single PRIMARY pagetree.`,
  valuesConfig: {
    PRIMARY: { description: 'The primary pagetree. There will always be exactly one of these per site.' },
    SANDBOX: { description: 'A pagetree that is currently being groomed to be the next primary pagetree.' },
    ARCHIVE: { description: 'A pagetree that used to be the primary pagetree.' }
  }
})

export enum DeleteStateInputNoFinalize {
  NOTDELETED = 0,
  DELETED = 2,
  ORPHAN_NOTDELETED = 3,
  ORPHAN_DELETED = 5,
  ALL = 6
}
export const DeleteStateNoFinalizeRootDefault = [DeleteStateInputNoFinalize.NOTDELETED]
export const DeleteStateNoFinalizeDefault = [DeleteStateInputNoFinalize.NOTDELETED, DeleteStateInputNoFinalize.ORPHAN_NOTDELETED]
export const DeleteStateNoFinalizeAll = [DeleteStateInputNoFinalize.NOTDELETED, DeleteStateInputNoFinalize.DELETED, DeleteStateInputNoFinalize.ORPHAN_NOTDELETED, DeleteStateInputNoFinalize.ORPHAN_DELETED]

registerEnumType(DeleteStateInputNoFinalize, {
  name: 'DeleteStateInputNoFinalize',
  description: 'Filter for whether an object is deleted, marked for deletion, or not deleted. Also filter for objects that have been orphaned. Default is typically [NOTDELETED, MARKEDFORDELETE] for root queries and [NOTDELETED, MARKEDFORDELETE, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE] for relations.',
  valuesConfig: {
    NOTDELETED: { description: 'Objects that have not been deleted and are not orphaned.' },
    DELETED: { description: 'Has been deleted and the deletion has been finalized. Also is not an orphan.' },
    ORPHAN_NOTDELETED: { description: 'Not specifically deleted by a user, but belongs to a parent object, like a site or pagetree, which has been deleted.' },
    ORPHAN_DELETED: { description: 'Specifically deleted by a user, but also belongs to a parent object, like a site or pagetree, which has been deleted.' },
    ALL: { description: 'Supercedes all the other filters. Essentially disables the filter, which is useful because this filter is generally enabled by default.' }
  }
})

@ObjectType({
  description: `A pagetree represents the page hierarchy in a site. Each pagetree begins
    with a single root page. A site may have multiple pagetrees, but only one active pagetree.
    Inactive pagetrees would be archives or sandboxes.`
})
export class Pagetree {
  @Field(type => ID)
  id: string

  @Field(type => PagetreeType)
  type: PagetreeType

  @Field()
  name: string

  @Field({ description: 'Pagetree has been soft-deleted but is still recoverable.' })
  deleted: boolean

  deletedAt?: DateTime

  @Field({ description: 'Date this pagetree was created. If it matches the site created date, it is the pagetree that was automatically created to be the site\'s PRIMARY.' })
  created: DateTime

  @Field({ nullable: true, description: 'Date this pagetree was archived. If an archive is promoted to primary and re-archived, only the last move to archive status is recorded.' })
  archived?: DateTime

  siteId: string
  deletedBy?: number

  constructor (row: any) {
    this.id = String(row.id)
    this.type = row.type
    this.name = row.name
    this.siteId = String(row.siteId)
    this.created = DateTime.fromJSDate(row.createdAt)
    this.archived = row.archivedAt ? DateTime.fromJSDate(row.archivedAt) : undefined
    this.deleted = row.deletedAt != null
    this.deletedAt = row.deletedAt ? DateTime.fromJSDate(row.deletedAt) : undefined
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class PagetreeFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [PagetreeType], { nullable: true })
  types?: PagetreeType[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field(type => [DeleteStateInputNoFinalize], { nullable: true, description: 'Return based on deleted status. If you do not specify this filter it will still hide deleted and orphaned by default. Orphaned refers to the situation where an object is effectively deleted because it belongs to a site, pagetree, or parent that has been deleted.' })
  deleteStates?: DeleteStateInputNoFinalize[]
}

@ObjectType()
export class PagetreeResponse extends ValidatedResponse {
  @Field({ nullable: true })
  pagetree?: Pagetree

  constructor (config: ValidatedResponseArgs & { pagetree?: Pagetree }) {
    super(config)
    this.pagetree = config.pagetree
  }
}

@ObjectType()
export class PagetreePermissions {
}

export enum PagetreePermission {
  RENAME = 'rename',
  PROMOTE = 'promote',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(PagetreePermission, {
  name: 'PagetreePermission',
  description: 'All the action types that can be individually permissioned on a pagetree.'
})
