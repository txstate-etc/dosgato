import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class Asset {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this asset. Should be used any time content links to an asset, so that content can migrate to new instances and point at the same asset.' })
  id: string

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
    this.internalId = row.id
    this.id = row.dataId
    this.name = row.name
    this.folderId = row.folderId
    this.dataId = row.dataId
    this.lastRawDownload = row.lastDownload
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class AssetFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true })
  folderIds?: string[]

  folderInternalIds?: number[]

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
