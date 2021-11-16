import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class LaunchURL {
  @Field({ description: 'No protocol. Example: www.txstate.edu' })
  host: string

  @Field({ description: 'Will always begin and end with a slash. Example: /history/. Should be a single slash if there is no path.' })
  path: string

  @Field({ description: 'Full URL prefix for this site. Always ends with a slash.' })
  prefix: string

  constructor (row: any) {
    this.host = row.launchHost
    this.path = row.launchPath || '/'
    this.prefix = `https://${this.host}${this.path}`
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
    this.deletedAt = DateTime.fromJSDate(row.deleted)
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

  @Field(type => [LaunchURLInput], { nullable: true, description: 'Return sites that match at least one of the given host/path combinations. The path may be longer than what is recorded as the site\'s launched path and it will still match.' })
  launchUrls?: LaunchURLInput[]

  @Field({ nullable: true, description: 'Return sites that are currently launched (i.e. they are publicly available at a specified URL other than the editing host).' })
  launched?: boolean
}

@InputType()
export class CreateSiteInput {
  @Field()
  name!: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  ownerId?: number

  @Field(type => [Number], { nullable: true })
  managerIds?: number[]

  // TODO: Should this input include the launch host and path? Would they know it when creating a site
  // or not until later?
}

@InputType()
export class UpdateSiteInput {
  @Field()
  name?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  ownerId?: number

  @Field(type => [Number], { nullable: true })
  managerIds?: number[]

  // TODO: What format should the launch host and path take here? How will the look in the dialog? Or does this even come from a dialog?
  // Or, is this set during the site launch process and belong in a different mutation?
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
  MANAGE_OWNERS = 'manageOwners',
  MANAGE_PAGETREES = 'managePagetrees',
  PROMOTE_PAGETREE = 'promotePagetree',
  CREATE_RULES = 'createRules',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(SitePermission, {
  name: 'SitePermission',
  description: 'All the action types that can be individually permissioned on a site.'
})
