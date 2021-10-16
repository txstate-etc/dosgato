import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role } from '../role'
import { Template } from '../template'
import { TemplateRule, TemplateRulePermissions } from './templaterule.model'

@Resolver(of => TemplateRule)
export class TemplateRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() templaterule: TemplateRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Template, { nullable: true, description: 'The site targeted by this rule. Null means it targets all sites.' })
  async site (@Ctx() ctx: Context, @Root() templaterule: TemplateRule) {
    throw new UnimplementedError()
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
