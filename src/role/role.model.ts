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

@ObjectType()
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
}

@ObjectType()
export class RolePermissions {}
