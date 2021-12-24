import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../role'

@ObjectType()
@InputType('GlobalRuleGrantsInput')
export class GlobalRuleGrants {
  @Field({ description: 'Grants ability to create/read/update/delete all roles, add roles to users and groups, and add users to groups.' })
  manageUsers!: boolean

  @Field({ description: 'Grants ability to create new sites in the system.' })
  createSites!: boolean

  @Field({ description: 'Grants ability to edit global data. Site-related data is governed by datarules instead.' })
  manageGlobalData!: boolean

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
export class GlobalRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  globalRule?: GlobalRule

  constructor (config: ValidatedResponseArgs & { globalRule?: GlobalRule }) {
    super(config)
    this.globalRule = config.globalRule
  }
}

@ObjectType()
export class GlobalRulePermissions {}
