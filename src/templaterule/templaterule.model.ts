import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { RuleType } from '../role'

@ObjectType()
@InputType()
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
  @Field(type => [ID], { nullable: true })
  roleIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Rules targeting all templates will NOT be returned when this filter is used. Include `null` to return those rules.' })
  templateKeys?: (string|null)[]

  @Field({ nullable: true, description: 'Return rules that grant the use permission.' })
  use?: boolean
}

@ObjectType()
export class TemplateRulePermissions {}