import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
export class DataFolder {
  @Field(type => Int)
  id: number

  @Field({ description: 'Name for the folder. Will be used when constructing the path.' })
  name: UrlSafeString

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy: number|null
  type: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.type = row.type
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class DataFolderFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return folders that are associated with one of the given sites.' })
  siteIds?: number[]

  @Field(type => Boolean, { nullable: true, description: 'Return folders that are the root folder of a site.' })
  root?: boolean

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
