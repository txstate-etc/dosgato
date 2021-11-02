import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../role'

@ObjectType()
@InputType('GlobalRuleGrantsInput')
export class GlobalRuleGrants {
  @Field({ description: 'Grants ability to create/read/update/delete all roles, add roles to users and groups, and add users to groups.' })
  manageUsers!: boolean

  constructor (row?: any) {
    if (row) {
      this.manageUsers = !!row.manageUsers
    }
  }
}

@ObjectType({ description: 'A global rule grants access that is unrelated to the site tree. For instance, the ability to manage users and roles. They are generally only useful for creating various levels of system administrator.' })
export class GlobalRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.GLOBAL

  @Field({ description: 'Permissions granted by this rule.' })
  grants: GlobalRuleGrants

  roleId: string

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.grants = new GlobalRuleGrants(row)
  }
}

@ObjectType()
export class GlobalRulePermissions {}
