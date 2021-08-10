import { createUnionType, Field, InputType, Int, ObjectType } from 'type-graphql'
import { AssetRule } from '../assetrule'
import { DataRule } from '../datarule'
import { GlobalRule } from '../globalrule/globalrule.model'
import { PageRule } from '../pagerule'
import { SiteRule } from '../siterule'

export const Rule = createUnionType({
  name: 'Rule',
  types: () => [GlobalRule, SiteRule, PageRule, AssetRule, DataRule]
})

@ObjectType()
export class Role {
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
export class RoleFilter {
  @Field(type => [Int])
  ids?: number[]
}

@ObjectType()
export class RolePermissions {}
