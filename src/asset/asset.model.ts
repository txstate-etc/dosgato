import { DateTime } from 'luxon'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { extension } from 'mime-types'
import { JsonData, UrlSafePath, UrlSafeString } from '../internal.js'

const resizeMimeToExt: Record<string, string> = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/avif': 'avif',
  'image/webp': 'webp'
}

@ObjectType({ description: 'Asset attributes only available for visual inline assets like images, animated GIFS, or videos.' })
export class BoxAttributes {
  @Field(type => Int)
  width: number

  @Field(type => Int)
  height: number

  constructor (row: any) {
    this.width = row.meta.width
    this.height = row.meta.height
  }

  static hasBox (row: any) {
    return !!row.meta?.width
  }
}

@ObjectType({ description: 'Assets are binary files like images or word documents that will be included or linked on pages. Assets do not get published and unpublished - the latest version is always considered to be the public version and there is no such thing as a private unpublished asset.' })
export class Asset {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this asset. Should be used any time content links to an asset, so that content can migrate to new instances and point at the same asset.' })
  id: string

  @Field({ description: 'Name of the asset, not including extension. May be different than the filename of the original upload.' })
  name: UrlSafeString

  @Field({ description: 'Filename that will be used when downloading the asset. Includes the extension.' })
  filename: string

  @Field(type => Int, { description: 'Filesize in bytes.' })
  size: number

  @Field({ description: 'The mime type for this asset, e.g. "text/plain".' })
  mime: string

  @Field({ description: 'The preferred extension for the mime type of the asset. May be different than the extension of the original upload since we use file inspection to identify file types.' })
  extension: string

  @Field({ nullable: true })
  box?: BoxAttributes

  @Field({ description: 'This is only the current checksum, old versions could have another checksum.' })
  checksum: string

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
    this.extension = extension(this.mime) || '' // TODO: extension can return false if mime is blank, not a string, or unrecognized. What should the extension be in that case?
    this.filename = [this.name as string, this.extension].filter(isNotBlank).join('.')
    this.box = BoxAttributes.hasBox(row) ? new BoxAttributes(row) : undefined
    this.folderInternalId = row.folderId
    this.dataId = row.dataId
    this.checksum = row.shasum
    this.lastRawDownload = row.lastDownload
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class AssetFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  legacyIds?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field(type => [AssetLinkInput], { nullable: true, description: 'Resolve asset links preferring id and falling back to path or checksum.' })
  links?: AssetLinkInput[]

  @Field(type => [String], { nullable: true })
  checksums?: string[]

  @Field(type => [ID], { nullable: true })
  folderIds?: string[]

  folderInternalIds?: number[]
  names?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return assets with the given paths.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return assets that descend from any of the given paths.' })
  beneath?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return assets that are direct children of any of the given paths.' })
  parentPaths?: string[]

  @Field(type => Int, { nullable: true, description: 'Return assets with filesize greater than the given size, in bytes. Use a negative number for less than.' })
  bytes?: number

  @Field({ nullable: true, description: 'true -> return assets referenced by any page, false -> return assets not referenced by any page, null -> return all assets' })
  referenced?: boolean

  @Field(type => Boolean, { nullable: true, description: 'true -> return only deleted assets, false -> return only nondeleted assets, null -> return all assets' })
  deleted?: boolean
}

export enum DownloadsResolution {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}
registerEnumType(DownloadsResolution, {
  name: 'DownloadsResolution',
  description: 'When returning download records, summarize the data by day, week, month, or year.'
})

@InputType()
export class DownloadsFilter {
  @Field({ nullable: true, description: 'Return download records from after the given date.' })
  after?: DateTime

  @Field(type => Int, { nullable: true, description: 'Return download records newer than this many months.' })
  months?: number

  @Field({ nullable: true, description: '' })
  resolution?: DownloadsResolution
}

@ObjectType()
export class DownloadRecord {
  @Field()
  date: DateTime

  @Field(type => Int)
  count: number

  constructor (public relatedId: string, datestr: string, downloads: number) {
    this.date = DateTime.fromFormat(datestr, 'yyyyMMdd')
    this.count = downloads
  }
}

@InputType()
export class UpdateAssetInput {
  @Field()
  name!: string

  @Field()
  checksum!: string

  // TODO: Other fields? Fields for binaries table?
}

@ObjectType()
export class AssetResponse extends ValidatedResponse {
  @Field({ nullable: true })
  asset?: Asset

  constructor (config: ValidatedResponseArgs & { asset?: Asset }) {
    super(config)
    this.asset = config.asset
  }
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
  @Field(type => ID, { description: 'Used for retrieval/display.' })
  id: string

  @Field()
  checksum: string

  @Field({ description: 'The mime type of this particular resized version. For instance, we may have resizes for each of the popular image formats like JPEG, AVIF, and WEBP.' })
  mime: string

  @Field({ description: 'The extension that matches the mime type of this resized version.' })
  extension: string

  @Field(type => Int, { description: 'Pixel width of the resized image.' })
  width: number

  @Field(type => Int, { description: 'Pixel height of the resized image.' })
  height: number

  @Field(type => Int, { description: 'A number from 0-100 that reflects the quality level of the resized image. 60-90 is typical.' })
  quality: number

  @Field(type => Int, { description: 'Filesize in bytes.' })
  size: number

  @Field(type => JsonData)
  settings: any

  @Field({ description: 'The last time the file was downloaded from the API service. Upstream caches could serve the file without updating this value.' })
  lastDownload: DateTime

  binaryId: number
  originalBinaryId: number

  constructor (row: any) {
    this.id = row.shasum
    this.size = row.bytes
    this.checksum = row.shasum
    this.mime = row.mime
    this.extension = resizeMimeToExt[this.mime] ?? 'jpg'
    this.width = row.width
    this.height = row.height
    this.quality = row.quality
    this.settings = row.settings
    this.lastDownload = DateTime.fromJSDate(row.lastdownload)
    this.binaryId = row.binaryId
    this.originalBinaryId = row.originalBinaryId
  }
}

@InputType()
export class AssetLinkInput {
  @Field(type => ID)
  id!: string

  @Field()
  path!: string

  @Field()
  checksum!: string
}
