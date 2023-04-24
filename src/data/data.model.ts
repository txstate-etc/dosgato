import { DataData } from '@dosgato/templating'
import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString, JsonData, DeleteState, UrlSafePath, DeleteStateInput } from '../internal.js'

@ObjectType({ description: 'Data are pieces of shareable versioned content with a template and a dialog but not rendering code. The data will be consumed by component templates, each of which will do its own rendering of the data. For example, an Article data type could be displayed by an Article List component or an Article Detail component. In addition, outside services could access the article data directly from GraphQL.' })
export class Data {
  internalId: number

  @Field(type => ID, { description: 'A globally unique identifier for this data. Should be used any time content links to data, so that content can migrate to new instances and point at the same thing.' })
  id: string

  @Field({ description: 'Name for this piece of data, to be displayed in the list view.' })
  name: UrlSafeString

  @Field({ description: 'Data has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this data was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  @Field({ description: 'Indicates whether this data is undeleted, marked for deletion, or deleted.' })
  deleteState: DeleteState

  deletedBy?: number
  dataId: string
  folderInternalId?: number
  siteId?: string
  displayOrder: number
  templateId: string
  templateKey: string
  orphaned: boolean

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.dataId
    this.name = row.name
    this.dataId = row.dataId
    this.folderInternalId = row.folderId
    this.displayOrder = row.displayOrder
    this.siteId = optionalString(row.siteId)
    this.templateId = String(row.templateId)
    this.deleted = row.deleteState !== DeleteState.NOTDELETED
    this.deletedAt = row.deletedAt ? DateTime.fromJSDate(row.deletedAt) : undefined
    this.deletedBy = row.deletedBy
    this.deleteState = row.deleteState
    this.templateKey = row.templateKey
    this.orphaned = row.orphaned
  }
}

@InputType()
export class DataFilter {
  // auto-increment ids are for internal use only
  internalIds?: number[]
  names?: string[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> return only global data, false -> return only data that belongs to some site, null -> return all data' })
  global?: boolean

  @Field({ nullable: true, description: 'true -> return only data that lives in the root; i.e. folderId is null' })
  root?: boolean

  @Field(type => [String], { nullable: true })
  folderIds?: string[]

  folderInternalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return data belonging to one of the specified sites.' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return data using one of the specified templates.' })
  templateKeys?: string[]

  @Field(type => [DeleteStateInput], { nullable: true, description: 'Return based on deleted status. If you do not specify this filter it will still hide deleted and orphaned by default but show those that are marked for deletion. Orphaned refers to the situation where an object is effectively deleted because it belongs to a site, pagetree, or parent that has been deleted.' })
  deleteStates?: DeleteStateInput[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return data entries with the given paths.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return data entries beneath or at any of the given paths.' })
  beneathOrAt?: string[]

  @Field(type => [DataLinkInput], { nullable: true, description: 'Resolve data links preferring id and falling back to path.' })
  links?: DataLinkInput[]

  @Field(type => Boolean, { nullable: true, description: 'Only return data entries that have been published.' })
  published?: boolean
}

@InputType()
export class CreateDataInput {
  @Field()
  name!: UrlSafeString

  @Field(type => JsonData)
  data!: DataData

  @Field(type => ID, { nullable: true })
  siteId?: string

  @Field(type => ID, { nullable: true })
  folderId?: string
}

@InputType()
export class UpdateDataInput {
  @Field(type => JsonData, { description: 'Should include the current schemaVersion of the UI sending it.' })
  data!: any

  @Field(type => Int, { nullable: true, description: 'The version of the data you had when you started the update. If provided, an optimistic concurrency check will prevent the mutation from completing if someone has changed it since it was shown to the user.' })
  dataVersion?: number

  @Field({ nullable: true, description: 'An optional comment describing the update.' })
  comment?: string
}

@InputType()
export class MoveDataTarget {
  @Field(type => ID, { nullable: true, description: 'Data entry should be placed before the data entry with this id in display order' })
  aboveTarget?: string

  @Field(type => ID, { nullable: true, description: 'The folder to which the data entry is moving. Will be ignored if aboveTarget is provided' })
  folderId?: string

  @Field(type => ID, { nullable: true, description: 'The site to which the data entry is moving. Will be ignored if aboveTarget or folderId is provided.' })
  siteId?: string
}

@ObjectType()
export class DataResponse extends ValidatedResponse {
  @Field({ nullable: true })
  data?: Data

  constructor (config: ValidatedResponseArgs & { data?: Data }) {
    super(config)
    this.data = config.data
  }
}

@ObjectType()
export class DataMultResponse extends ValidatedResponse {
  @Field(type => [Data], { nullable: true })
  data?: Data[]

  constructor (config: ValidatedResponseArgs & { data?: Data[] }) {
    super(config)
    this.data = config.data
  }
}

@ObjectType()
export class DataPermissions {}

export enum DataPermission {
  VIEWLATEST = 'viewlatest',
  PUBLISH = 'publish',
  UNPUBLISH = 'unpublish',
  UPDATE = 'update',
  MOVE = 'move',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(DataPermission, {
  name: 'DataPermission',
  description: 'All the action types that can be individually permissioned on a data entry.'
})

@InputType()
export class DataLinkInput {
  @Field(type => ID)
  id!: string

  @Field(type => ID)
  templateKey!: string

  @Field(type => ID, { nullable: true })
  siteId!: string

  @Field()
  path!: string
}
