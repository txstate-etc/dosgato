import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { RuleTypes } from '../role'

@ObjectType()
@InputType()
export class GlobalRuleGrants {
  @Field({ description: 'Grants ability to create/read/update/delete all roles, add roles to users and groups, and add users to groups.' })
  manageUsers!: boolean

  constructor (row?: any) {
    if (row) {
      this.manageUsers = !!row.manageUsers
    }
  }
}

@ObjectType()
export class GlobalRule {
  @Field(type => Int)
  id: number

  @Field(type => RuleTypes, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleTypes.GLOBAL

  @Field({ description: 'Permissions granted by this rule.' })
  grants: GlobalRuleGrants

  constructor (row: any) {
    this.id = row.id
    this.grants = new GlobalRuleGrants(row)
  }
}

@ObjectType()
export class GlobalRulePermissions {}
