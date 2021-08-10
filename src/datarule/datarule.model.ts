import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
@InputType()
export class DataRuleGrants {
  @Field({ description: 'Grants ability to view the latest version of data entries of this type in the specified site or folder. Published data entries are considered public data.' })
  viewlatest!: boolean

  @Field({ description: 'Grants ability to create data entries of this type in the specified site or folder.' })
  create!: boolean

  @Field({ description: 'Grants ability to update data entries of this type in the specified site or folder.' })
  update!: boolean

  @Field({ description: 'Grants ability to publish data entries of this type in the specified site or folder.' })
  publish!: boolean

  @Field({ description: 'Grants ability to unpublish entries of this type in the specified site or folder.' })
  unpublish!: boolean

  @Field({ description: 'Grants ability to delete data entries of this type in the specified site or folder.' })
  delete!: boolean

  @Field({ description: 'Grants ability to undelete entries of this type in the specified site or folder.' })
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
  @Field(type => Int)
  id: number

  @Field({ nullable: true, description: 'The data type this rule grants privileges for. Null means it applies to all data types.' })
  type?: UrlSafeString

  @Field({ description: 'Permissions granted by this rule.' })
  grants: DataRuleGrants

  @Field({ nullable: true, description: 'Folder to which this rule should apply. We take a path so that it could apply to the same folder name in multiple sites if site is left null.' })
  path?: string

  roleId: number
  siteId?: number

  constructor (row: any) {
    this.id = row.id
    this.roleId = row.roleId
    this.siteId = row.siteId
    this.type = row.type
    this.grants = new DataRuleGrants(row)
    this.path = row.path
  }
}

@ObjectType()
export class DataRulePermissions {}
