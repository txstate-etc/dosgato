import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../role'

@ObjectType({ description: 'A site rule grants permissions applicable to a site itself, like the ability to launch the site on a particular subdomain. It can also grant permissions on all sites by leaving the siteId null. Granting access to multiple sites requires multiple rules, one per site.' })
@InputType()
export class SiteRuleGrants {
  @Field({ description: 'Grants ability to set or update the public URL for affected sites.' })
  launch!: boolean

  @Field({ description: 'Grants ability to rename the site.' })
  rename!: boolean

  @Field({ description: 'Grants ability to create, edit, delete, and undelete new pagetrees in affected sites.' })
  managePagetrees!: boolean

  @Field({ description: 'Grants ability to promote a pagetree to be the active pagetree for the site; i.e. promote the sandbox to be live.' })
  promotePagetree!: boolean

  @Field({ description: 'Grants ability to delete the site.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete the site.' })
  undelete!: boolean

  constructor (row?: any) {
    if (row) {
      this.launch = !!row.launch
      this.rename = !!row.rename
      this.managePagetrees = !!row.managePagetrees
      this.promotePagetree = !!row.promotePagetree
      this.delete = !!row.delete
      this.undelete = !!row.undelete
    }
  }
}

@ObjectType({ description: 'A rule that grants site-related privileges.' })
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
    this.siteId = row.siteId ? String(row.siteId) : undefined
    this.grants = new SiteRuleGrants(row)
  }
}

@InputType()
export class SiteRuleFilter {
  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [ID], { nullable: true })
  siteIds?: string[]

  @Field({ nullable: true, description: 'Return rules that grant the launch permission.' })
  launch?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the rename permission.' })
  rename?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the managePagetrees permission.' })
  managePagetrees?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the promotePagetree permission.' })
  promotePagetree?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the delete permission.' })
  delete?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the undelete permission.' })
  undelete?: boolean
}

@ObjectType()
export class SiteRulePermissions {}
