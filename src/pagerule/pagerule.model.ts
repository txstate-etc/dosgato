import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'

export enum RulePathMode {
  SELF,
  SUB,
  SELFANDSUB
}
registerEnumType(RulePathMode, {
  name: 'RulePathMode',
  description: 'Control the way a rule is targeted on its path.',
  valuesConfig: {
    SELF: { description: 'Point at the path, do not include descendants.' },
    SUB: { description: 'Point below the path, do not include the page itself.' },
    SELFANDSUB: { description: 'Point at the path and all descendants.' }
  }
})

@ObjectType()
@InputType()
export class PageRuleGrants {
  @Field({ description: 'Grants ability to view the latest unpublished version of pages. Published pages are completely public.' })
  viewlatest: boolean = false

  @Field({ description: 'Grants ability to update pages but not necessarily move or publish them.' })
  update: boolean = false

  @Field({ description: 'Grants ability to move the pages impacted by this rule. Note that user must have the `create` permission for the target page.' })
  move: boolean = false

  @Field({ description: 'Grants ability to create or move pages beneath the pages impacted by this rule.' })
  create: boolean = false

  @Field({ description: 'Grants ability to publish pages either for the first time or to the latest version.' })
  publish: boolean = false

  @Field({ description: 'Grants ability to unpublish pages.' })
  unpublish: boolean = false

  @Field({ description: 'Grants ability to soft-delete pages.' })
  delete: boolean = false

  @Field({ description: 'Grants ability to undelete pages.' })
  undelete: boolean = false
}

@ObjectType({ description: 'A rule that grants page-related privileges.' })
export class PageRule {
  @Field({ description: 'The path for which this rule grants privileges. Use `mode` to control inheritance behavior.' })
  path: string

  @Field({ description: 'Control whether this rule should apply to the page at `path`, its descendants, or both.' })
  mode: RulePathMode

  @Field({ description: 'Permissions granted by this rule.' })
  grants: PageRuleGrants

  roleId: number
  siteId?: number
  pagetreeId?: number

  constructor (row: any) {
    this.roleId = row.role_id
    this.siteId = row.site_id
    this.pagetreeId = row.pagetree_id
    this.path = row.path
    this.mode = row.mode
    this.grants = {
      viewlatest: !!row.viewlatest,
      create: !!row.create,
      update: !!row.update,
      move: !!row.move,
      delete: !!row.delete,
      undelete: !!row.undelete,
      publish: !!row.publish,
      unpublish: !!row.unpublish
    }
  }
}

@InputType()
export class PageRuleFilter {
  @Field(type => [Int], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that apply to all sites.' })
  siteIds?: (number|null)[]

  @Field(type => [Int], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that apply to all pagetrees, or 0 to return rules that apply only to the active pagetree.' })
  pagetreeIds?: (number|null)[]

  @Field(type => [Int], { nullable: true })
  roleIds?: number[]

  @Field(type => [String], { nullable: true, description: 'Return rules that apply to any of the given paths.' })
  paths?: string[]

  @Field({ nullable: true, description: 'Return rules that grant the viewlatest permission.' })
  viewlatest?: boolean

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

  @Field({ nullable: true, description: 'Return rules that grant the publish permission.' })
  publish?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the unpublish permission.' })
  unpublish?: boolean
}

@ObjectType()
export class PageRulePermissions {}
