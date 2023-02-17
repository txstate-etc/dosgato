import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { DeletedFilter, DeleteState, UrlSafePath, UrlSafeString } from '../internal.js'

@ObjectType({ description: 'An asset folder is a folder that contains assets and other asset folders. Each site has exactly one root asset folder that is nameless and cannot be deleted.' })
export class AssetFolder {
  internalId: number

  @Field(type => ID)
  id: string

  @Field(type => UrlSafeString, { description: 'Name for the folder. Will be used when constructing the path.' })
  name: string

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ description: 'Indicates whether this asset folder is undeleted, marked for deletion, or deleted.' })
  deleteState: DeleteState

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  siteId: string
  deletedBy?: number
  path: string
  pathSplit: number[]
  parentInternalId?: number
  pathAsParent: string

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.guid
    this.name = row.name
    this.siteId = String(row.siteId)
    this.path = row.path
    this.pathSplit = row.path.split(/\//).filter(isNotBlank).map(Number)
    this.parentInternalId = this.pathSplit[this.pathSplit.length - 1]
    this.pathAsParent = '/' + [...this.pathSplit, this.internalId].join('/')
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
    this.deleteState = this.deleteState = row.deleteState === 0 ? DeleteState.NOTDELETED : ((row.deleteState === 1 ? DeleteState.MARKEDFORDELETE : DeleteState.DELETED))
  }
}

@InputType()
export class AssetFolderFilter {
  internalIds?: number[]
  internalIdPaths?: string[]
  internalIdPathsRecursive?: string[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field(type => [AssetFolderLinkInput], { nullable: true, description: 'Resolve asset folder links preferring id and falling back to path.' })
  links?: AssetFolderLinkInput[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are parents of the given folder ids.' })
  parentOfFolderIds?: string[]

  parentOfFolderInternalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are children of the given folder ids.' })
  childOfFolderIds?: string[]

  childOfFolderInternalIds?: number[]
  names?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return folders with the given paths.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return folders that descend from any of the given paths.' })
  beneath?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return folders that are direct children of any of the given paths.' })
  parentPaths?: string[]

  @Field(type => Boolean, { nullable: true, description: 'Return folders that are the root folder of a site.' })
  root?: boolean

  @Field(type => DeletedFilter, { nullable: true })
  deleted?: DeletedFilter
}

@InputType()
export class CreateAssetFolderInput {
  @Field(type => UrlSafeString)
  name!: string

  @Field(type => ID, { description: 'The existing asset folder that will be the new asset folder\'s parent' })
  parentId!: string // guid
}

@ObjectType()
export class AssetFolderResponse extends ValidatedResponse {
  @Field({ nullable: true })
  assetFolder?: AssetFolder

  constructor (config: ValidatedResponseArgs & { assetFolder?: AssetFolder }) {
    super(config)
    this.assetFolder = config.assetFolder
  }
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

@InputType()
export class AssetFolderLinkInput {
  @Field(type => ID)
  id!: string

  @Field(type => ID)
  siteId!: string

  @Field()
  path!: string
}
