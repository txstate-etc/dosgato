import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class Site {
  @Field(type => Int)
  id: number

  @Field()
  name: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
  }
}

@InputType()
export class SiteFilter {
  @Field(type => [Int])
  ids?: number[]
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
