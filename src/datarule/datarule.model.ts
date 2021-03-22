import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
@InputType()
export class DataRuleGrants {
  @Field({ description: 'Grants ability to view the latest version of data entries of this type.' })
  viewlatest!: boolean

  @Field({ description: 'Grants ability to create data entries of this type.' })
  create!: boolean

  @Field({ description: 'Grants ability to update data entries of this type.' })
  update!: boolean

  @Field({ description: 'Grants ability to publish data entries of this type.' })
  publish!: boolean

  @Field({ description: 'Grants ability to unpublish entries of this type.' })
  unpublish!: boolean

  @Field({ description: 'Grants ability to delete data entries of this type.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete entries of this type.' })
  undelete!: boolean

  constructor (row?: any) {
    if (row) {
      this.viewlatest = !!row.viewlatest
      this.create = !!row.create
      this.update = !!row.update
      this.publish = !!row.publish
      this.unpublish = !!row.unpublish
      this.delete = !!row.delete
      this.undelete = !!row.undelete
    }
  }
}

@ObjectType({ description: 'A rule that grants asset-related privileges.' })
export class DataRule {
  @Field({ nullable: true, description: 'The data type this rule grants privileges for. Null means it applies to all data types.' })
  type?: UrlSafeString

  @Field({ description: 'Permissions granted by this rule.' })
  grants: DataRuleGrants

  roleId: number

  constructor (row: any) {
    this.roleId = row.role_id
    this.type = row.type
    this.grants = new DataRuleGrants(row)
  }
}

@InputType()
export class DataRuleFilter {
  @Field(type => [Int], { nullable: true })
  roleIds?: number[]

  @Field(type => [UrlSafeString], { nullable: true })
  types?: UrlSafeString[]

  @Field({ nullable: true, description: 'Return rules that grant the viewlatest permission.' })
  viewlatest?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the create permission.' })
  create?: boolean

  @Field({ nullable: true, description: 'Return rules that grant the update permission.' })
  update?: boolean

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
export class DataRulePermissions {}
