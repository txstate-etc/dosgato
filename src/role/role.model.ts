import { createUnionType, Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { AssetRule } from '../assetrule'
import { DataRule } from '../datarule'
import { GlobalRule } from '../globalrule/globalrule.model'
import { PageRule } from '../pagerule'
import { SiteRule } from '../siterule'

export enum RuleType {
  GLOBAL = 'global',
  SITE = 'site',
  PAGE = 'page',
  ASSET = 'asset',
  DATA = 'data'
}
registerEnumType(RuleType, {
  name: 'RuleType'
})

export const Rule = createUnionType({
  name: 'Rule',
  types: () => [GlobalRule, SiteRule, PageRule, AssetRule, DataRule]
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

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
  }
}

@InputType()
export class RoleFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return roles that are associated with any of the given users.' })
  users?: string[]
}

@ObjectType()
export class RolePermissions {}
