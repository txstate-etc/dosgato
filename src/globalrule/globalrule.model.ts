import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../internal.js'

@ObjectType()
@InputType('GlobalRuleGrantsInput')
export class GlobalRuleGrants {
  @Field({ description: 'Grants ability to create/edit sub-roles, create/enable/disable/edit users, and assign users to roles associated with a site.' })
  manageAccess!: boolean

  @Field({ description: 'Grants ability to create/edit top-level roles and assign users to roles not associated with a site.' })
  manageParentRoles!: boolean

  @Field({ description: 'Grants ability to create new sites in the system.' })
  createSites!: boolean

  @Field({ description: 'Grants ability to edit global data. Site-related data is governed by datarules instead.' })
  manageGlobalData!: boolean

  @Field({ description: 'Grants ability to assign templates to sites and pagetrees and set templates as universal' })
  manageTemplates!: boolean

  constructor (row?: any) {
    if (row) {
      this.manageAccess = !!row.manageAccess
      this.manageParentRoles = !!row.manageParentRoles
      this.createSites = !!row.createSites
      this.manageGlobalData = !!row.manageGlobalData
      this.manageTemplates = !!row.manageTemplates
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

@InputType()
export class GlobalRuleFilter {
  ids?: string[]
  roleIds?: string[]
}

@InputType()
export class CreateGlobalRuleInput {
  @Field()
  roleId!: string

  @Field(type => GlobalRuleGrants, { nullable: true })
  grants?: GlobalRuleGrants
}

@InputType()
export class UpdateGlobalRuleInput {
  @Field()
  ruleId!: string

  @Field(type => GlobalRuleGrants, { nullable: true })
  grants?: GlobalRuleGrants
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
