import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role, RoleService } from '../role'
import { Template, TemplateService } from '../template'
import { TemplateRule, TemplateRulePermissions } from './templaterule.model'
import { isNull } from 'txstate-utils'

@Resolver(of => TemplateRule)
export class TemplateRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() templaterule: TemplateRule) {
    return await ctx.svc(RoleService).getRoleForRule(templaterule.roleId)
  }

  @FieldResolver(returns => Template, { nullable: true, description: 'The template targeted by this rule. Null means it targets all templates.' })
  async template (@Ctx() ctx: Context, @Root() templaterule: TemplateRule) {
    if (isNull(templaterule.templateId)) return null
    else return await ctx.svc(TemplateService).findById(templaterule.templateId)
  }

  @FieldResolver(returns => TemplateRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() templaterule: TemplateRule) {
    return templaterule
  }
}

@Resolver(of => TemplateRulePermissions)
export class TemplateRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: TemplateRule) {
    throw new UnimplementedError()
  }
}
