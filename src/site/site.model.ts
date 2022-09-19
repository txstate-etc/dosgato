import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { optionalString, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { DeletedFilter } from '../internal.js'

@ObjectType()
export class LaunchURL {
  @Field({ description: 'No protocol. Example: www.txstate.edu' })
  host: string

  @Field({ description: 'Will always begin and end with a slash. Example: /history/. Should be a single slash if there is no path.' })
  path: string

  @Field({ description: 'Full URL prefix for this site. Always ends with a slash.' })
  prefix: string

  @Field({ description: 'When false the site should not be considered to be live. We are just saving the URL it was/will be hosted at, for future reference.' })
  enabled: boolean

  constructor (row: any) {
    this.host = row.launchHost
    this.path = row.launchPath || '/'
    this.prefix = `https://${this.host}${this.path}`
    this.enabled = row.launchEnabled
  }
}

@ObjectType()
export class Site {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  primaryPagetreeId: string
  rootAssetFolderInternalId: number
  organizationId?: string
  ownerId?: number

  @Field({ nullable: true, description: 'URL outside the editing host that points to this site. Null if the site is not launched.' })
  url?: LaunchURL

  @Field({ description: 'Site has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this site was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy?: number

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    if (row.launchHost) this.url = new LaunchURL(row)
    this.primaryPagetreeId = String(row.primaryPagetreeId)
    this.rootAssetFolderInternalId = row.rootAssetFolderId
    this.organizationId = optionalString(row.organizationId)
    this.ownerId = row.ownerId
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
  }
}

@InputType()
export class LaunchURLInput {
  @Field()
  host!: string

  @Field()
  path!: string
}

@InputType()
export class SiteFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [String], { nullable: true })
  names?: string[]

  @Field(type => [LaunchURLInput], { nullable: true, description: 'Return sites that match at least one of the given host/path combinations. The path may be longer than what is recorded as the site\'s launched path and it will still match.' })
  launchUrls?: LaunchURLInput[]

  @Field({ nullable: true, description: 'Return sites that are currently launched (i.e. they are publicly available at a specified URL other than the editing host).' })
  launched?: boolean

  @Field(type => DeletedFilter, { nullable: true })
  deleted?: DeletedFilter

  ownerInternalIds?: number[]

  managerInternalIds?: number[]

  organizationIds?: string[]

  assetRootIds?: number[]
}

@InputType()
export class CreateSiteInput {
  @Field()
  name!: string

  @Field(type => ID)
  rootPageTemplateKey!: string

  @Field({ description: 'The current schema version of the admin UI. Used to tag the root page of the new site.' })
  schemaVersion!: DateTime
}

@InputType()
export class UpdateSiteManagementInput {
  @Field(type => ID, { nullable: true })
  organizationId?: string

  @Field(type => ID, { nullable: true })
  ownerId?: string

  @Field(type => [ID], { nullable: true })
  managerIds?: string[]
}

@ObjectType()
export class SiteResponse extends ValidatedResponse {
  @Field({ nullable: true })
  site?: Site

  constructor (config: ValidatedResponseArgs & { site?: Site }) {
    super(config)
    this.site = config.site
  }
}

@ObjectType()
export class SitePermissions {}

export enum SitePermission {
  LAUNCH = 'launch',
  RENAME = 'rename',
  GOVERNANCE = 'governance',
  MANAGE_STATE = 'manageState',
  DELETE = 'delete'
}
registerEnumType(SitePermission, {
  name: 'SitePermission',
  description: 'All the action types that can be individually permissioned on a site.'
})
