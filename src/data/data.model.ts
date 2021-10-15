import { DateTime } from 'luxon'
import { isNotNull, optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType({ description: 'Data are pieces of shareable versioned content with a template and a dialog but not rendering code. The data will be consumed by component templates, each of which will do its own rendering of the data. For example, an Article data type could be displayed by an Article List component or an Article Detail component. In addition, outside services could access the article data directly from GraphQL.' })
export class Data {
  internalId: number

  @Field(type => ID, { description: 'A globally unique identifier for this data. Should be used any time content links to data, so that content can migrate to new instances and point at the same thing.' })
  id: string

  @Field({ description: 'Data has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this data was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy?: number
  dataId: string
  folderInternalId?: number
  siteId?: string

  // template identifier is NOT a property because it's part of the upgradeable data,
  // we'll have to use the versionedservice indexing to look up data by template id

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.dataId
    this.dataId = row.dataId
    this.folderInternalId = row.folderId
    this.siteId = optionalString(row.siteId)
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class DataFilter {
  // auto-increment ids are for internal use only
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> return only global data, false -> return only data that belongs to some site, null -> return all data' })
  global?: boolean

  @Field(type => [String], { nullable: true })
  folderIds?: string[]

  folderInternalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return data belonging to one of the specified sites.' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return data using one of the specified templates.' })
  templateKeys?: string[]

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted data, false -> return only nondeleted data, undefined -> return all data' })
  deleted?: boolean
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
