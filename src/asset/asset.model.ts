import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { JsonData } from '../scalars/jsondata'

@ObjectType({ description: 'Asset attributes only available for visual inline assets like images, animated GIFS, or videos.' })
export class BoxAttributes {
  @Field()
  width: number

  @Field()
  height: number

  constructor (row: any) {
    this.width = row.width
    this.height = row.height
  }

  static hasBox (row: any) {
    return !!row.width
  }
}

@ObjectType({ description: 'Assets are binary files like images or word documents that will be included or linked on pages. Assets do not get published and unpublished - the latest version is always considered to be the public version and there is no such thing as a private unpublished asset.' })
export class Asset {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this asset. Should be used any time content links to an asset, so that content can migrate to new instances and point at the same asset.' })
  id: string

  @Field({ description: 'Filename that will be used when downloading the asset. Does not include an extension. May be different than the filename of the original upload.' })
  name: string

  @Field({ description: 'Filesize in bytes.' })
  size: number

  @Field({ description: 'The mime type for this asset, e.g. "text/plain".' })
  mime: string

  @Field({ description: 'The preferred extension for the mime type of the asset. May be different than the extension of the original upload since we use file inspection to identify file types.' })
  extension: string

  @Field()
  box?: BoxAttributes

  @Field({ description: 'Asset has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this asset was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  // does not include downloads of resized versions, but the fieldresolver will
  lastRawDownload?: DateTime

  deletedBy?: number
  folderInternalId: number
  dataId: string

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.dataId
    this.name = row.name
    this.size = row.filesize
    this.mime = row.mime // should be detected upon upload
    this.extension = row.extension // prefer to use a library here that takes this.mime as input
    this.box = BoxAttributes.hasBox(row) ? new BoxAttributes(row) : undefined
    this.folderInternalId = row.folderId
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

@ObjectType()
export class AssetResize {
  @Field()
  width: number

  @Field()
  height: number

  @Field()
  quality: number

  @Field(type => JsonData)
  settings: any

  @Field()
  lastDownload: DateTime

  binaryId: number
  originalBinaryId: number

  constructor (row: any) {
    this.width = row.width
    this.height = row.height
    this.quality = row.quality
    this.settings = row.settings
    this.lastDownload = DateTime.fromJSDate(row.lastdownload)
    this.binaryId = row.binaryId
    this.originalBinaryId = row.originalBinaryId
  }
}
