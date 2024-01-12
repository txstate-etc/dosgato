import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { optionalString, isNotNull } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { DeletedFilter, UrlSafeString } from '../internal.js'

export enum LaunchState {
  PRELAUNCH = 0,
  LAUNCHED = 1,
  DECOMMISSIONED = 2
}

registerEnumType(LaunchState, {
  name: 'LaunchState',
  description: 'Determine whether a site has not been launched yet, is currently launched, or is decommissioned.',
  valuesConfig: {
    PRELAUNCH: { description: 'Site has never been live or is down for overhaul. Primary pagetree should be treated as a sandbox.' },
    LAUNCHED: { description: 'Site is currently live.' },
    DECOMMISSIONED: { description: 'Site was once live, but has since been taken offline. Primary pagetree should be treated as an archive.' }
  }
})

@InputType()
class LaunchStateInput {
  @Field(type => LaunchState)
  launchState?: LaunchState
}

@ObjectType()
export class LaunchURL {
  @Field({ description: 'No protocol. Example: www.txstate.edu' })
  host: string

  @Field({ description: 'Will always begin and end with a slash. Example: /history/. Should be a single slash if there is no path.' })
  path: string

  @Field({ description: 'Full URL prefix for this site. Always ends with a slash.' })
  prefix: string

  @Field(type => LaunchState, { description: 'A site can be pre-launch, launched, or decommissioned. If it is not launched, we are just saving the URL it was/will be hosted at, for future reference.' })
  enabled: LaunchState

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
  organizationId?: string
  ownerId?: number

  @Field({ nullable: true, description: 'URL outside the editing host that points to this site. Null if the site is not launched.' })
  url?: LaunchURL

  @Field({ description: 'Site has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this site was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy?: number

  @Field(type => LaunchState, { description: 'Indicates whether this site is pre-launch, launched, or decommissioned.' })
  launchState: LaunchState

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    if (row.launchHost) this.url = new LaunchURL(row)
    this.primaryPagetreeId = String(row.primaryPagetreeId)
    this.organizationId = optionalString(row.organizationId)
    this.ownerId = row.ownerId
    this.deleted = isNotNull(row.deletedAt)
    this.deletedAt = DateTime.fromJSDate(row.deletedAt)
    this.deletedBy = row.deletedBy
    this.launchState = row.launchEnabled
  }
}

@InputType()
export class SiteFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [UrlSafeString], { nullable: true })
  names?: string[]

  @Field(type => [String], { nullable: true, description: 'Return sites that match at least one of the given URLs. The URLs may be longer than what is recorded as the site\'s launched path and it will still match.' })
  launchUrls?: string[]

  @Field({ nullable: true, description: 'Return sites that are currently launched (i.e. they are publicly available at a specified URL other than the editing host).', deprecationReason: 'Use launchStates: [LAUNCHED]' })
  launched?: boolean

  @Field(type => [LaunchState], { nullable: true, description: 'Return sites in one of the specified launch states.' })
  launchStates?: LaunchState[]

  @Field(type => DeletedFilter, { nullable: true })
  deleted?: DeletedFilter

  @Field(type => Boolean, { nullable: true, description: 'Only return sites the current user should see as an admin in the site management UI.' })
  viewForEdit?: boolean

  ownerInternalIds?: number[]

  managerInternalIds?: number[]

  organizationIds?: string[]
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
