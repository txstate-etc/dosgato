import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
@InputType()
export class SiteRuleGrants {
  @Field({ description: 'Grants ability to set or update the public URL for affected sites.' })
  launch!: boolean

  @Field({ description: 'Grants ability to rename affected sites.' })
  rename!: boolean

  @Field({ description: 'Grants ability to create, edit, delete, and undelete new pagetrees in affected sites.' })
  managePagetrees!: boolean

  @Field({ description: 'Grants ability to promotePagetree sites.' })
  promotePagetree!: boolean

  @Field({ description: 'Grants ability to delete sites.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete entries of this type.' })
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
  @Field({ description: 'Permissions granted by this rule.' })
  grants: SiteRuleGrants

  roleId: number
  siteId?: number

  constructor (row: any) {
    this.roleId = row.role_id
    this.siteId = row.site_id
    this.grants = new SiteRuleGrants(row)
  }
}

@InputType()
export class SiteRuleFilter {
  @Field(type => [Int], { nullable: true })
  roleIds?: number[]

  @Field(type => [Int], { nullable: true })
  siteIds?: number[]

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
