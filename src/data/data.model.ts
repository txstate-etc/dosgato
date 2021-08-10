import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class Data {
  @Field(type => Int)
  id: number

  @Field({ description: 'Data has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this data was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy: number|null
  templateId: number
  dataId: string
  folderId: number|null
  siteId: number|null

  constructor (row: any) {
    this.id = row.id
    this.templateId = row.templateId
    this.dataId = row.dataId
    this.folderId = row.folderId
    this.siteId = row.siteId
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class DataFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field({ nullable: true, description: 'true -> return only global data, false -> return only data that belongs to some site, null -> return all data' })
  global?: boolean

  @Field(type => [Int], { nullable: true, description: 'Return data belonging to one of the specified sites.' })
  siteIds?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return data using one of the specified templates.' })
  templateIds?: number[]

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
