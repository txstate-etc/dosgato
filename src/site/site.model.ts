import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class LaunchURL {
  @Field({ description: 'No protocol. Example: www.txstate.edu' })
  host!: string

  @Field({ description: 'Should begin and end with a slash. Example: /history/. Should be a single slash if there is no path.' })
  path!: string
}

@ObjectType()
export class Site {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  primaryPagetreeId: string

  @Field({ nullable: true, description: 'URL outside the editing host that points to this site. Null if the site is not launched.' })
  url?: LaunchURL

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    if (row.launchHost) {
      this.url = {
        host: row.launchHost,
        path: row.launchPath || '/'
      }
    }
    this.primaryPagetreeId = String(row.primaryPagetreeId)
  }
}

@InputType()
export class SiteFilter {
  @Field(type => [ID])
  ids?: string[]

  @Field({ description: 'Return sites that are currently launched (i.e. they are publicly available at a specified URL other than the editing host).' })
  launched?: boolean
}

@ObjectType()
export class SitePermissions {}

export enum SitePermission {
  LAUNCH = 'launch',
  RENAME = 'rename',
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
