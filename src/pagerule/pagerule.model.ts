import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { RuleType } from '../role'

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
export class PageRuleGrants {
  @Field({ description: 'Grants ability to view the latest unpublished version of pages. Published pages are completely public.' })
  viewlatest!: boolean

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
      this.viewlatest = row.viewlatest
      this.create = row.create
      this.update = row.update
      this.move = row.move
      this.delete = row.delete
      this.undelete = row.undelete
      this.publish = row.publish
      this.unpublish = row.unpublish
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

@ObjectType()
export class PageRulePermissions {}
