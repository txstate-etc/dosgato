import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class Asset {
  @Field(type => Int)
  id: number

  @Field({ description: 'Filename that will be used when downloading the asset. May be different than the filename of the original upload.' })
  name: string

  @Field({ description: 'Asset has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this asset was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  // does not include downloads of resized versions, but the fieldresolver will
  lastRawDownload?: DateTime

  deletedBy: number|null
  folderId: number
  dataId: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.folderId = row.folder_id
    this.dataId = row.data_id
    this.lastRawDownload = row.lastdownload
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deleted_by
  }
}

@InputType()
export class AssetFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [Int], { nullable: true })
  siteIds?: number[]

  @Field(type => [Int], { nullable: true })
  folderIds?: number[]

  @Field({ nullable: true, description: 'true -> return assets referenced by any page, false -> return assets not referenced by any page, null -> return all assets' })
  referenced?: boolean

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted assets, false -> return only nondeleted assets, null -> return all assets' })
  deleted?: boolean
}

@ObjectType()
export class AssetPermissions {}

export enum AssetPermission {
  UPDATE = 'update',
  MOVE = 'move',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(AssetPermission, {
  name: 'AssetPermission',
  description: 'All the action types that can be individually permissioned on an asset.'
})
