import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
export class Folder {
  @Field(type => Int)
  id: number

  @Field({ description: 'Name for the folder. Will be used when constructing the path.' })
  name: UrlSafeString

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy: number|null
  parentId: number

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.parentId = row.parent_id
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deleted_by
  }
}

@InputType()
export class FolderFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [Int], { nullable: true })
  siteIds?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return folders that are parents of the given folder ids.' })
  parentOfFolderIds?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return folders that are children of the given folder ids.' })
  childOfFolderIds?: number[]

  @Field(type => Boolean, { nullable: true, description: 'Return folders that are the root folder of a site.' })
  root?: boolean

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted folders, false -> return only nondeleted folders, undefined -> return all folders' })
  deleted?: boolean
}

@ObjectType()
export class FolderPermissions {}
