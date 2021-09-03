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

  primaryPagetreeId: number
  rootAssetFolderId: number
  organizationId?: number
  ownerId?: number

  @Field({ nullable: true, description: 'URL outside the editing host that points to this site. Null if the site is not launched.' })
  url?: LaunchURL

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    if (row.launchHost) this.url = new LaunchURL(row)
    this.primaryPagetreeId = row.primaryPagetreeId
    this.rootAssetFolderId = row.rootAssetFolderId
    this.organizationId = row.organizationId
    this.ownerId = row.ownerId
  }
}

@InputType()
export class SiteFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'Return sites that are currently launched (i.e. they are publicly available at a specified URL other than the editing host).' })
  launched?: boolean
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
