import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { RuleType } from 'internal'

export enum RulePathMode {
  SELF = 'self',
  SUB = 'sub',
  SELFANDSUB = 'selfsub'
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
export class PageRuleGrantsBase {
  @Field({ description: 'Grants ability to update page date but not necessarily move, rename, or publish them.' })
  update!: boolean

  @Field({ description: 'Grants ability to move or rename the pages impacted by this rule. Note that user must have the `create` permission for the target page.' })
  move!: boolean

  @Field({ description: 'Grants ability to create or move pages beneath the pages impacted by this rule.' })
  create!: boolean

  @Field({ description: 'Grants ability to publish pages either for the first time or to the latest version.' })
  publish!: boolean

  @Field({ description: 'Grants ability to unpublish pages.' })
  unpublish!: boolean

  @Field({ description: 'Grants ability to soft-delete pages.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete pages.' })
  undelete!: boolean

  constructor (row?: any) {
    if (row) {
      this.create = !!row.create
      this.update = !!row.update
      this.move = !!row.move
      this.delete = !!row.delete
      this.undelete = !!row.undelete
      this.publish = !!row.publish
      this.unpublish = !!row.unpublish
    }
  }
}

@ObjectType()
@InputType('PageRuleGrantsInput')
export class PageRuleGrants extends PageRuleGrantsBase {
  @Field({ description: 'Grants ability to view the published version of pages. Admins do NOT set this directly - it is implied by having any applicable pagerule.' })
  view!: boolean

  @Field({ description: 'Grants ability to view unpublished versions of pages. Admins do NOT set this directly - it is implied by having either update or publish grants.' })
  viewlatest!: boolean

  @Field({ description: 'Grants ability to view pages in the page editing UI. Admins do NOT set this directly - it is implied by having other grants.' })
  viewForEdit!: boolean

  constructor (row?: any) {
    super(row)
    if (row) {
      this.view = true // every rule grants view
      this.viewlatest = this.update || this.publish
      this.viewForEdit = this.create || this.update || this.move || this.delete || this.undelete || this.publish || this.unpublish
    }
  }
}

@ObjectType({ description: 'A rule that grants page-related privileges. Each role has multiple rules, each rule belonging only to that role.' })
export class PageRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.PAGE

  @Field({ description: 'The path for which this rule grants privileges. Use `mode` to control inheritance behavior.' })
  path: string

  @Field(type => RulePathMode, { description: 'Control whether this rule should apply to the page at `path`, its descendants, or both.' })
  mode: RulePathMode

  @Field({ description: 'Permissions granted by this rule.' })
  grants: PageRuleGrants

  roleId: string
  siteId?: string
  pagetreeId?: string

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.siteId = optionalString(row.siteId)
    this.pagetreeId = optionalString(row.pagetreeId)
    this.path = row.path
    this.mode = row.mode
    this.grants = new PageRuleGrants(row)
  }
}

@InputType()
export class PageRuleFilter {
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [ID], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that are NOT limited to a site.' })
  siteIds?: (string|null)[]

  @Field(type => [ID], { nullable: 'itemsAndList', description: 'Include a `null` to return rules that are NOT limited to a pagetree.' })
  pagetreeIds?: (string|null)[]

  @Field(type => [String], { nullable: true, description: 'Return rules that apply to any of the given paths.' })
  paths?: string[]

  @Field({ nullable: true, description: 'Return rules that grant the create permission.' })
  create?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the update permission.' })
  update?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the move permission.' })
  move?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the publish permission.' })
  publish?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the unpublish permission.' })
  unpublish?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the delete permission.' })
  delete?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the undelete permission.' })
  undelete?: boolean
}

@ObjectType()
export class PageRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  pageRule?: PageRule

  constructor (config: ValidatedResponseArgs & { pageRule?: PageRule }) {
    super(config)
    this.pageRule = config.pageRule
  }
}

@InputType()
export class CreatePageRuleInput {
  @Field()
  roleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  pagetreeId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => RulePathMode, { nullable: true })
  mode?: RulePathMode

  @Field(type => PageRuleGrantsBase, { nullable: true })
  grants?: PageRuleGrantsBase
}

@InputType()
export class UpdatePageRuleInput {
  @Field()
  ruleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  pagetreeId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => RulePathMode, { nullable: true })
  mode?: RulePathMode

  @Field(type => PageRuleGrantsBase, { nullable: true })
  grants?: PageRuleGrantsBase
}

@ObjectType()
export class PageRulePermissions {}
