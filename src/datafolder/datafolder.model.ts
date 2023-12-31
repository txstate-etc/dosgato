import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString, UrlSafePath, DeleteState, DeleteStateInput } from '../internal.js'

@ObjectType({ description: 'A folder that contains data objects. Each folder can only accept data objects with one particular template. Data folders are a single level organizational tool (folders do not contain more folders) and optional (data may not belong to any folder at all).' })
export class DataFolder {
  internalId: number

  @Field(type => ID)
  id: string

  @Field({ description: 'Name for the folder. Will be used when constructing the path.' })
  name: UrlSafeString

  @Field({ description: 'Folder has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ description: 'Indicates whether this folder is undeleted, marked for deletion, or deleted.' })
  deleteState: DeleteState

  @Field({ nullable: true, description: 'Date this folder was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  templateId: string
  siteId?: string
  deletedBy?: number
  templateKey: string
  orphaned: boolean
  resolvedPath: string
  resolvedPathWithoutSitename: string

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.guid
    this.name = row.name
    this.templateId = String(row.templateId)
    this.siteId = optionalString(row.siteId)
    this.deleteState = row.deleteState
    this.deleted = row.deleteState !== DeleteState.NOTDELETED
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
    this.templateKey = row.templateKey
    this.orphaned = row.orphaned
    this.resolvedPath = `/${row.siteName ?? 'global'}/${row.name}`
    this.resolvedPathWithoutSitename = '/' + row.name
  }
}

@InputType()
export class DataFolderFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return folders designated for data of one of the given templates.' })
  templateKeys?: string[]

  templateIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return folders that are associated with one of the given sites.' })
  siteIds?: string[]

  @Field(type => Boolean, { nullable: true, description: 'true -> return only folders that are not associated with a site.' })
  global?: boolean

  @Field(type => [DeleteStateInput], { nullable: true, description: 'Return based on deleted status. If you do not specify this filter it will still hide deleted and orphaned by default but show those that are marked for deletion. Orphaned refers to the situation where an object is effectively deleted because it belongs to a site, pagetree, or parent that has been deleted.' })
  deleteStates?: DeleteStateInput[]

  @Field(type => [DataFolderLinkInput], { nullable: true, description: 'Resolve data folder links preferring id and falling back to path.' })
  links?: DataFolderLinkInput[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return folders with the given paths.' })
  paths?: string[]

  @Field(type => [UrlSafePath], { nullable: true, description: 'Return folders beneath or at the given paths.' })
  beneathOrAt?: string[]

  names?: string[]
}

@InputType()
export class CreateDataFolderInput {
  @Field()
  name!: UrlSafeString

  @Field(type => ID)
  templateKey!: string

  @Field(type => ID, { nullable: true })
  siteId?: string
}

@ObjectType()
export class DataFolderResponse extends ValidatedResponse {
  @Field({ nullable: true })
  dataFolder?: DataFolder

  constructor (config: ValidatedResponseArgs & { dataFolder?: DataFolder }) {
    super(config)
    this.dataFolder = config.dataFolder
  }
}

@ObjectType()
export class DataFoldersResponse extends ValidatedResponse {
  @Field(type => [DataFolder], { nullable: true })
  dataFolders?: DataFolder[]

  constructor (config: ValidatedResponseArgs & { dataFolders?: DataFolder[] }) {
    super(config)
    this.dataFolders = config.dataFolders
  }
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

@InputType()
export class DataFolderLinkInput {
  @Field(type => ID)
  id!: string

  @Field(type => ID)
  templateKey!: string

  @Field(type => ID, { nullable: true })
  siteId!: string

  @Field()
  path!: string
}
