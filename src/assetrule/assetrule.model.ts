import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RulePathMode } from '../pagerule'
import { RuleType } from '../role'

interface AssetRuleRow {
  id: number|string
  roleId: number|string
  siteId?: number|string
  path: string
  mode: RulePathMode
  create?: number|boolean
  update?: number|boolean
  move?: number|boolean
  delete?: number|boolean
  undelete?: number|boolean
}

@ObjectType()
@InputType('AssetRuleGrantsInput')
export class AssetRuleGrants {
  @Field({ description: 'Grants ability to view assets and folders. Always true on every rule since having any other grant implies this one. Do not try to set this in mutations.' })
  view!: boolean

  @Field({ description: 'Grants ability to view assets in the asset manager UI. Admins do NOT set this directly - it is implied by having other grants.' })
  viewForEdit!: boolean

  @Field({ description: 'Grants ability to create or move assets and folders into folders impacted by this rule.' })
  create!: boolean

  @Field({ description: 'Grants ability to update assets and folders but not necessarily move them.' })
  update!: boolean

  @Field({ description: 'Grants ability to move assets and folders impacted by this rule. Note that user must have the `create` permission for the target folder.' })
  move!: boolean

  @Field({ description: 'Grants ability to soft-delete assets and folders.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete assets and folders.' })
  undelete!: boolean

  constructor (row?: AssetRuleRow) {
    if (row) {
      this.create = !!row.create
      this.update = !!row.update
      this.move = !!row.move
      this.delete = !!row.delete
      this.undelete = !!row.undelete
      this.view = true // every rule grants view access
      this.viewForEdit = this.create || this.update || this.move || this.delete || this.undelete
    }
  }
}

@ObjectType({ description: 'A rule that grants asset-related privileges. Each role has multiple rules, each rule belonging only to that role.' })
export class AssetRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.ASSET

  @Field({ description: 'The path for which this rule grants privileges. Use `mode` to control inheritance behavior.' })
  path: string

  @Field(type => RulePathMode, { description: 'Control whether this rule should apply to the folder or asset at `path`, its descendants, or both. Modes that include descendants have no effect if the path specifies an asset.' })
  mode: RulePathMode

  @Field({ description: 'Permissions granted by this rule.' })
  grants: AssetRuleGrants

  roleId: string
  siteId?: string

  constructor (row: AssetRuleRow) {
    this.id = optionalString(row.id)
    this.roleId = String(row.roleId)
    this.siteId = optionalString(row.siteId)
    this.path = row.path
    this.mode = row.mode
    this.grants = new AssetRuleGrants(row)
  }
}

@InputType()
export class AssetRuleFilter {
  ids?: number[]

  @Field(type => [ID], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that are NOT limited to a site.' })
  siteIds?: (string|null)[]

  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [String], { nullable: true, description: 'Return rules that apply to any of the given paths.' })
  paths?: string[]

  @Field({ nullable: true, description: 'Return rules that grant the create permission.' })
  create?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the update permission.' })
  update?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the move permission.' })
  move?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the delete permission.' })
  delete?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the undelete permission.' })
  undelete?: boolean
}

@InputType()
export class CreateAssetRuleInput {
  @Field()
  roleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => RulePathMode, { nullable: true })
  mode?: RulePathMode

  @Field(type => AssetRuleGrants, { nullable: true })
  grants?: AssetRuleGrants
}

@InputType()
export class UpdateAssetRuleInput {
  @Field()
  ruleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => RulePathMode, { nullable: true })
  mode?: RulePathMode

  @Field(type => AssetRuleGrants, { nullable: true })
  grants?: AssetRuleGrants
}

@ObjectType()
export class AssetRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  assetRule?: AssetRule

  constructor (config: ValidatedResponseArgs & { assetRule?: AssetRule }) {
    super(config)
    this.assetRule = config.assetRule
  }
}

@ObjectType()
export class AssetRulePermissions {}
