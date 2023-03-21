import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../internal.js'

@ObjectType()
@InputType()
export class SiteRuleGrantsInput {
  @Field({ description: 'Grants ability to set or update the public URL for affected sites.' })
  launch!: boolean

  @Field({ description: 'Grants ability to rename the site.' })
  rename!: boolean

  @Field({ description: 'Grants ability to edit the owner, managers, organization, and comments for affected sites' })
  governance!: boolean

  @Field({ description: 'Grants the ability to create, delete, promote, and archive pagetrees in affected sites.' })
  manageState!: boolean

  @Field({ description: 'Grants ability to delete and undelete the site.' })
  delete!: boolean

  constructor (row?: any) {
    if (row) {
      this.launch = !!row.launch
      this.rename = !!row.rename
      this.governance = !!row.governance
      this.manageState = !!row.manageState
      this.delete = !!row.delete
    }
  }
}

@ObjectType()
export class SiteRuleGrants extends SiteRuleGrantsInput {
  @Field({ description: 'Grants ability to view site in the site manager UI. Any siterule automatically grants this.' })
  viewForEdit!: boolean

  constructor (row?: any) {
    super(row)
    if (row) {
      this.viewForEdit = true
    }
  }
}

@ObjectType({ description: 'A site rule grants permissions applicable to a site itself, like the ability to launch the site on a particular subdomain. It can also grant permissions on all sites by leaving the siteId null. Granting access to multiple sites requires multiple rules, one per site.' })
export class SiteRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.SITE

  @Field({ description: 'Permissions granted by this rule.' })
  grants: SiteRuleGrants

  roleId: string
  siteId?: string

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.siteId = optionalString(row.siteId)
    this.grants = new SiteRuleGrants(row)
  }
}

@InputType()
export class SiteRuleFilter {
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: (string | null)[]

  @Field({ nullable: true, description: 'Return rules that grant the launch permission.' })
  launch?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the rename permission.' })
  rename?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the governance permission.' })
  governance?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the manageState permission.' })
  manageState?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the delete permission.' })
  delete?: boolean
}

@InputType()
export class CreateSiteRuleInput {
  @Field()
  roleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field(type => SiteRuleGrantsInput, { nullable: true })
  grants?: SiteRuleGrantsInput
}

@InputType()
export class UpdateSiteRuleInput {
  @Field()
  ruleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field(type => SiteRuleGrantsInput, { nullable: true })
  grants?: SiteRuleGrantsInput
}

@ObjectType()
export class SiteRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  siteRule?: SiteRule

  constructor (config: ValidatedResponseArgs & { siteRule?: SiteRule }) {
    super(config)
    this.siteRule = config.siteRule
  }
}

@ObjectType()
export class SiteRulePermissions {}
