import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from 'internal'

@ObjectType()
@InputType('TemplateRuleGrantsInput')
export class TemplateRuleGrants {
  @Field({
    description: `Grants ability to use the template in any site. Normally templates are authorized
    for sites, but this allows certain users to use a template even if the site would not normally
    allow it. Component templates are still subject to the template whitelist established by another
    template's area.`
  })
  use!: boolean

  constructor (row?: any) {
    if (row) {
      this.use = !!row.use
    }
  }
}

@ObjectType({ description: 'A template rule grants permissions applicable to a template.' })
export class TemplateRule {
  @Field(type => ID)
  id: string

  @Field(type => RuleType, { description: 'The rule type as needed by the Role.rules types argument.' })
  type: string = RuleType.SITE

  @Field({ description: 'Permissions granted by this rule.' })
  grants: TemplateRuleGrants

  roleId: string
  templateId?: number

  constructor (row: any) {
    this.id = String(row.id)
    this.roleId = String(row.roleId)
    this.templateId = row.templateId
    this.grants = new TemplateRuleGrants(row)
  }
}

@InputType()
export class TemplateRuleFilter {
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [ID], { nullable: 'itemsAndList', description: 'Rules targeting all templates will NOT be returned when this filter is used. Include `null` to return those rules.' })
  templateKeys?: (string|null)[]

  templateIds?: (number|null)[]

  @Field({ nullable: true, description: 'Return rules that grant the use permission.' })
  use?: boolean
}

@InputType()
export class CreateTemplateRuleInput {
  @Field()
  roleId!: string

  @Field({ nullable: true })
  templateId?: string

  @Field(type => TemplateRuleGrants, { nullable: true })
  grants?: TemplateRuleGrants
}

@InputType()
export class UpdateTemplateRuleInput {
  @Field()
  ruleId!: string

  @Field({ nullable: true })
  templateId?: string

  @Field(type => TemplateRuleGrants, { nullable: true })
  grants?: TemplateRuleGrants
}

@ObjectType()
export class TemplateRuleResponse extends ValidatedResponse {
  @Field({ nullable: true })
  templateRule?: TemplateRule

  constructor (config: ValidatedResponseArgs & { templateRule?: TemplateRule }) {
    super(config)
    this.templateRule = config.templateRule
  }
}

@ObjectType()
export class TemplateRulePermissions {}
