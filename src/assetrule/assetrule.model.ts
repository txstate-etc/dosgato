import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { RulePathMode } from '../pagerule'

@ObjectType()
@InputType()
export class AssetRuleGrants {
  @Field({ description: 'Grants ability to create or move assets and folders into folders impacted by this rule.' })
  create: boolean = false

  @Field({ description: 'Grants ability to update assets and folders but not necessarily move them.' })
  update: boolean = false

  @Field({ description: 'Grants ability to move assets and folders impacted by this rule. Note that user must have the `create` permission for the target folder.' })
  move: boolean = false

  @Field({ description: 'Grants ability to soft-delete assets and folders.' })
  delete: boolean = false

  @Field({ description: 'Grants ability to undelete assets and folders.' })
  undelete: boolean = false
}

@ObjectType({ description: 'A rule that grants asset-related privileges.' })
export class AssetRule {
  @Field({ description: 'The path for which this rule grants privileges. Use `mode` to control inheritance behavior.' })
  path: string

  @Field({ description: 'Control whether this rule should apply to the folder or asset at `path`, its descendants, or both. Modes that include descendants have no effect if the path specifies an asset.' })
  mode: RulePathMode

  @Field({ description: 'Permissions granted by this rule.' })
  grants: AssetRuleGrants

  roleId: number
  siteId?: number

  constructor (row: any) {
    this.roleId = row.role_id
    this.siteId = row.site_id
    this.path = row.path
    this.mode = row.mode
    this.grants = {
      create: !!row.create,
      update: !!row.update,
      move: !!row.move,
      delete: !!row.delete,
      undelete: !!row.undelete
    }
  }
}

@InputType()
export class AssetRuleFilter {
  @Field(type => [Int], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that apply to all sites.' })
  siteIds?: (number|null)[]

  @Field(type => [Int], { nullable: true })
  roleIds?: number[]

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
