import { DateTime } from 'luxon'
import { isNotNull, optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType({ description: 'A folder that contains data objects. Each folder can only accept data objects with one particular template. Data folders are a single level organizational tool (folders do not contain more folders) and optional (data may not belong to any folder at all).' })
export class DataFolder {
  internalId: number

  @Field(type => ID)
  id: string

  @Field({ description: 'Name for the folder. Will be used when constructing the path.' })
  name: UrlSafeString

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  templateId: number
  siteId?: string
  deletedBy?: number

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.guid
    this.name = row.name
    this.templateId = row.templateId
    this.siteId = optionalString(row.siteId)
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class DataFolderFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return folders designated for data of one of the given templates.' })
  templateKeys?: string[]

  templateIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are associated with one of the given sites.' })
  siteIds?: string[]

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted folders, false -> return only nondeleted folders, undefined -> return all folders' })
  deleted?: boolean
}

@ObjectType()
export class DataFolderPermissions {}

export enum DataFolderPermission {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(DataFolderPermission, {
  name: 'DataFolderPermission',
  description: 'All the action types that can be individually permissioned on a data entry.'
})
