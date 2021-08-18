import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RulePathMode } from '../pagerule'
import { RuleType } from '../role'

@ObjectType()
@InputType()
export class AssetRuleGrants {
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

  constructor (row?: any) {
    if (row) {
      this.create = !!row.create
      this.update = !!row.update
      this.move = !!row.move
      this.delete = !!row.delete
      this.undelete = !!row.undelete
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

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.siteId = String(row.siteId)
    this.path = row.path
    this.mode = row.mode
    this.grants = new AssetRuleGrants(row)
  }
}

@InputType()
export class AssetRuleFilter {
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

@ObjectType()
export class AssetRulePermissions {}
