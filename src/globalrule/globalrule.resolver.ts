import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role } from '../role'
import { GlobalRule, GlobalRulePermissions } from './globalrule.model'

@Resolver(of => GlobalRule)
export class GlobalRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() globalrule: GlobalRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => GlobalRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() globalrule: GlobalRule) {
    return globalrule
  }
}

@Resolver(of => GlobalRulePermissions)
export class GlobalRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: GlobalRule) {
    throw new UnimplementedError()
  }
}
