import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType, ensureEndSlash } from '../internal.js'

@ObjectType()
@InputType()
export class DataRuleGrantsBase {
  @Field({ description: 'Grants ability to create data entries of this type in the specified site or folder.' })
  create!: boolean

  @Field({ description: 'Grants ability to update data entries of this type in the specified site or folder.' })
  update!: boolean

  @Field({ description: 'Grants ability to move or rename the data entries impacted by this rule. Note that user must have the `create` permission for the target folder.' })
  move!: boolean

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
      this.create = !!row.create
      this.update = !!row.update
      this.move = !!row.move
      this.publish = !!row.publish
      this.unpublish = !!row.unpublish
      this.delete = !!row.delete
      this.undelete = !!row.undelete
    }
  }
}

@ObjectType()
@InputType('DataRuleGrantsInput')
export class DataRuleGrants extends DataRuleGrantsBase {
  @Field({ description: 'Grants ability to view the published version of data. Always true on every rule since having any other grant implies this one. Do not try to set this in mutations.' })
  view!: boolean

  @Field({ description: 'Grants ability to view unpublished versions of data. Required for data to show up in Admin UI.' })
  viewlatest!: boolean

  @Field({ description: 'Grants ability to view this data in the data editing UI. Admins do NOT set this directly - it is implied by having other grants.' })
  viewForEdit!: boolean

  constructor (row?: any) {
    super(row)
    if (row) {
      this.view = true
      this.viewlatest = this.update || this.publish || !!row.viewlatest
      this.viewForEdit = true
    }
  }
}

@ObjectType({ description: 'A rule that grants data-related privileges. Each role has multiple rules, each rule belonging only to that role.' })
export class DataRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.DATA

  @Field({ description: 'Permissions granted by this rule.' })
  grants: DataRuleGrants

  @Field({ description: 'Folder to which this rule should apply. We take a path so that it could apply to the same folder name in multiple sites or multiple template types, if site or template is left null.' })
  path: string

  @Field({ description: 'The rule only applies to global data.' })
  global: boolean

  templateId?: string
  roleId: string
  siteId?: string
  pathSlash: string

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.siteId = optionalString(row.siteId)
    this.templateId = optionalString(row.templateId)
    this.grants = new DataRuleGrants(row)
    this.path = row.path
    this.global = row.isGlobal
    this.pathSlash = ensureEndSlash(row.path)
  }
}

@InputType()
export class DataRuleFilter {
  ids?: string[]
  roleIds?: string[]
  siteIds?: (string | null)[]
  global?: boolean
  templateIds?: (string | null)[]
}

@InputType()
export class CreateDataRuleInput {
  @Field()
  roleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  global?: boolean

  @Field({ nullable: true })
  templateId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => DataRuleGrantsBase, { nullable: true })
  grants?: DataRuleGrantsBase
}

@InputType()
export class UpdateDataRuleInput {
  @Field()
  ruleId!: string

  @Field({ nullable: true })
  siteId?: string

  @Field({ nullable: true })
  global?: boolean

  @Field({ nullable: true })
  templateId?: string

  @Field({ nullable: true })
  path?: string

  @Field(type => DataRuleGrantsBase, { nullable: true })
  grants?: DataRuleGrantsBase
}

@ObjectType()
export class DataRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  dataRule?: DataRule

  constructor (config: ValidatedResponseArgs & { dataRule?: DataRule }) {
    super(config)
    this.dataRule = config.dataRule
  }
}

@ObjectType()
export class DataRulePermissions {}
