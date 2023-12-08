import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { extension } from 'mime-types'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { DeleteState, DeleteStateInput, FilenameSafePath, FilenameSafeString, JsonData, LargeInt, LaunchState, LinkInputContext, PagetreeType, UrlSafePath } from '../internal.js'

const mimeToExtOverrides: Record<string, string> = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/x-eps': 'eps'
}

@ObjectType({ description: 'Asset attributes only available for visual inline assets like images, animated GIFS, or videos.' })
export class BoxAttributes {
  @Field(type => Int)
  width: number

  @Field(type => Int)
  height: number

  constructor (meta: any) {
    this.width = Math.round(meta.width)
    this.height = Math.round(meta.height)
  }

  static hasBox (meta: any) {
    return !!meta.width
  }
}

@ObjectType({ description: 'Assets are binary files like images or word documents that will be included or linked on pages. Assets do not get published and unpublished - the latest version is always considered to be the public version and there is no such thing as a private unpublished asset.' })
export class Asset {
  internalId: number // auto_increment id for internal use only

  @Field(type => ID, { description: 'A globally unique identifier for this asset. Should be used any time content links to an asset, so that content can migrate to new instances and point at the same asset.' })
  id: string

  @Field({ description: 'Name of the asset, not including extension. May be different than the filename of the original upload.' })
  name: FilenameSafeString

  @Field({ description: 'An identifier that uniquely identifies the asset in its pagetree. This is not globally unique as it may be copied along with the asset into a new pagetree.' })
  linkId: string

  @Field({ description: 'Filename that will be used when downloading the asset. Includes the extension.' })
  filename: string

  @Field(type => LargeInt, { description: 'Filesize in bytes.' })
  size: number

  @Field({ description: 'The mime type for this asset, e.g. "text/plain".' })
  mime: string

  @Field({ description: 'The preferred extension for the mime type of the asset. May be different than the extension of the original upload since we use file inspection to identify file types.' })
  extension: string

  @Field({ description: 'This is only the current checksum, old versions could have another checksum.' })
  checksum: string

  @Field({ description: 'Asset has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this asset was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  @Field({ description: 'Indicates whether this asset is undeleted, marked for deletion, or deleted.' })
  deleteState: DeleteState

  // does not include downloads of resized versions, but the fieldresolver will
  lastRawDownload?: DateTime

  deletedBy?: number
  folderInternalId: number
  dataId: string
  intDataId: number
  pagetreeType: PagetreeType
  orphaned: boolean
  siteId: string
  pagetreeId: string

  @Field({ description: 'Indicates whether this asset belongs to a site that is pre-launch, launched, or decommissioned.' })
  launchState: LaunchState

  stringMeta: string | object // mysql returns object, mariadb returns string
  parsedMeta: any
  get meta (): any | undefined {
    try {
      this.parsedMeta ??= typeof this.stringMeta === 'string' ? JSON.parse(this.stringMeta) : this.stringMeta
    } catch {
      this.parsedMeta = {}
    }
    return this.parsedMeta
  }

  @Field(type => BoxAttributes, { nullable: true })
  get box (): BoxAttributes | undefined {
    return BoxAttributes.hasBox(this.meta) ? new BoxAttributes(this.meta) : undefined
  }

  constructor (row: any) {
    this.stringMeta = row.meta
    this.internalId = row.id
    this.id = String(row.dataId)
    this.name = row.name
    this.linkId = row.linkId
    this.size = row.filesize
    this.mime = row.mime // should be detected upon upload
    this.extension = mimeToExtOverrides[this.mime] ?? (extension(this.mime) || '')
    if (this.extension === 'jpeg') this.extension = 'jpg'
    this.filename = [this.name as string, this.extension].filter(isNotBlank).join('.')
    this.folderInternalId = row.folderId
    this.dataId = this.id
    this.intDataId = row.dataId
    this.checksum = row.shasum
    this.lastRawDownload = row.lastDownload
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = row.deletedAt ? DateTime.fromJSDate(row.deletedAt) : undefined
    this.deletedBy = row.deletedBy
    this.deleteState = row.deleteState
    this.pagetreeType = row.pagetreeType
    this.orphaned = !!row.orphaned
    this.pagetreeId = String(row.pagetreeId)
    this.siteId = String(row.siteId)
    this.launchState = row.launchEnabled
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

  @Field(type => [AssetLinkInput], { nullable: true, description: 'Resolve asset links preferring linkId and falling back to path or checksum.' })
  links?: AssetLinkInput[]

  @Field(type => [String], { nullable: true })
  checksums?: string[]

  @Field(type => [ID], { nullable: true })
  folderIds?: string[]

  @Field(type => [ID], { nullable: true })
  pagetreeIds?: string[]

  @Field(type => [PagetreeType], { nullable: true, description: 'Only return assets in the pagetrees of their site with the types specified.' })
  pagetreeTypes?: PagetreeType[]

  folderInternalIds?: number[]
  names?: string[]

  @Field(type => [FilenameSafePath], { nullable: true, description: 'Return assets with the given paths.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return assets that descend from any of the given paths.' })
  beneath?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return assets that are direct children of any of the given paths.' })
  parentPaths?: string[]

  @Field(type => LargeInt, { nullable: true, description: 'Return assets with filesize greater than the given size, in bytes. Use a negative number for less than.' })
  bytes?: number

  @Field({ nullable: true, description: 'true -> return assets referenced by any page, false -> return assets not referenced by any page, null -> return all assets' })
  referenced?: boolean

  @Field(type => [DeleteStateInput], { nullable: true, description: 'Return based on deleted status. If you do not specify this filter it will still hide deleted and orphaned by default but show those that are marked for deletion. Orphaned refers to the situation where an object is effectively deleted because it belongs to a site, pagetree, or parent that has been deleted.' })
  deleteStates?: DeleteStateInput[]

  @Field(type => Boolean, { nullable: true, description: 'Return assets that the user should see in the editing interface, rather than all assets they are technically permitted to see because they are public.' })
  viewForEdit?: boolean

  linkIds?: string[]
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
export class AssetsResponse extends ValidatedResponse {
  @Field(type => [Asset])
  assets: Asset[]

  constructor (config?: ValidatedResponseArgs & { assets?: Asset[] }) {
    super(config ?? {})
    this.assets = config?.assets ?? []
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

  @Field({ nullable: true, description: 'The last time the file was downloaded from the API service. Upstream caches could serve the file without updating this value.' })
  lastDownload?: DateTime

  binaryId: number
  originalBinaryId: number

  stringMeta: string | object // mysql returns object, mariadb returns string
  parsedMeta: any
  get meta (): any {
    try {
      this.parsedMeta ??= typeof this.stringMeta === 'string' ? JSON.parse(this.stringMeta) : this.stringMeta
    } catch {
      this.parsedMeta = {}
    }
    return this.parsedMeta
  }

  stringSettings: string | object
  parsedSettings: any
  @Field(type => JsonData)
  get settings (): any {
    try {
      this.parsedSettings ??= typeof this.stringSettings === 'string' ? JSON.parse(this.stringSettings) : this.stringSettings
    } catch {
      this.parsedSettings = {}
    }
    return this.parsedSettings
  }

  get lossless (): boolean | undefined {
    return this.settings.lossless
  }

  constructor (row: any) {
    this.id = row.shasum
    this.size = row.bytes
    this.checksum = row.shasum
    this.mime = row.mime
    this.extension = mimeToExtOverrides[this.mime] ?? 'jpg'
    this.width = row.width
    this.height = row.height
    this.quality = row.quality
    this.stringSettings = row.othersettings
    this.lastDownload = row.lastdownload ? DateTime.fromJSDate(row.lastdownload) : undefined
    this.binaryId = row.binaryId
    this.originalBinaryId = row.originalBinaryId
    this.stringMeta = row.meta
  }
}

@InputType()
export class AssetLinkInput {
  @Field()
  linkId!: string

  @Field(type => ID)
  siteId!: string

  @Field(type => FilenameSafePath)
  path!: string

  @Field()
  checksum!: string

  @Field(type => LinkInputContext, { nullable: true, description: 'Context information for where this link was placed. If the link is on a sandbox page, for instance, we would want to look up this link in the sandbox pagetree instead of the main pagetree. If no context is specified, links will only be found in the PRIMARY pagetree.' })
  context?: LinkInputContext
}
