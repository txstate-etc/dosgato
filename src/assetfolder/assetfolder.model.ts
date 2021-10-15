import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType({ description: 'An asset folder is a folder that contains assets and other asset folders. Each site has exactly one root asset folder that is nameless and cannot be deleted.' })
export class AssetFolder {
  internalId: number

  @Field(type => ID)
  id: string

  @Field({ description: 'Name for the folder. Will be used when constructing the path.' })
  name: UrlSafeString

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy?: number
  parentInternalId: number

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.guid
    this.name = row.name
    this.parentInternalId = row.parentId
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class AssetFolderFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are parents of the given folder ids.' })
  parentOfFolderIds?: string[]

  parentOfFolderInternalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are children of the given folder ids.' })
  childOfFolderIds?: string[]

  childOfFolderInternalIds?: number[]

  @Field(type => Boolean, { nullable: true, description: 'Return folders that are the root folder of a site.' })
  root?: boolean

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted folders, false -> return only nondeleted folders, undefined -> return all folders' })
  deleted?: boolean
}

@ObjectType()
export class AssetFolderPermissions {}

export enum AssetFolderPermission {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(AssetFolderPermission, {
  name: 'AssetFolderPermission',
  description: 'All the action types that can be individually permissioned on a data entry.'
})
