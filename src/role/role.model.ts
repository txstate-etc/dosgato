import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { UrlSafeString } from '../internal.js'

export enum RuleType {
  GLOBAL = 'global',
  SITE = 'site',
  PAGE = 'page',
  ASSET = 'asset',
  DATA = 'data',
  TEMPLATE = 'template'
}
registerEnumType(RuleType, {
  name: 'RuleType'
})

@ObjectType({
  description: `A role links a user or group to a set of rules that grant
  access to various objects in the system. Typically, each rule grants access to one
  site at a time, and grants one or more specific permissions like read, update, create,
  or many more. There are other situations possible like granting access to a pagetree.
  See each of the rule types for more information.`
})
export class Role {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  @Field({ nullable: true })
  siteId?: string

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
    this.siteId = optionalString(row.siteId)
  }
}

@InputType()
export class RoleFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return roles managed by any of the specified user ids.' })
  managerIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return roles associated with any of the given site ids.' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return roles that have been granted to any of the given users.' })
  users?: string[]

  @Field(type => [UrlSafeString], { nullable: true, description: 'Return roles matching one of the given names.' })
  names?: string[]

  @Field(type => [UrlSafeString], { nullable: true, description: 'Exclude roles matching one of the given names.' })
  notNames?: string[]
}

@ObjectType()
export class RoleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  role?: Role

  constructor (config: ValidatedResponseArgs & { role?: Role }) {
    super(config)
    this.role = config.role
  }
}

@ObjectType()
export class RolePermissions {}
