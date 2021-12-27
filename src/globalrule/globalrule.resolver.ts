import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root, Mutation, Arg } from 'type-graphql'
import { Role, RoleService, GlobalRule, GlobalRuleGrants, GlobalRulePermissions, GlobalRuleResponse } from 'internal'

@Resolver(of => GlobalRule)
export class GlobalRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() globalrule: GlobalRule) {
    return await ctx.svc(RoleService).getRoleForRule(globalrule.roleId)
  }

  @FieldResolver(returns => GlobalRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() globalrule: GlobalRule) {
    return globalrule
  }

  @Mutation(returns => GlobalRuleResponse)
  async createGlobalRule (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('grants', type => GlobalRuleGrants) grants: GlobalRuleGrants) {
    throw new UnimplementedError()
  }

  @Mutation(returns => GlobalRuleResponse)
  async updateGlobalRule (@Ctx() ctx: Context, @Arg('ruleId', type => String) ruleId: string, @Arg('grants', type => GlobalRuleGrants) grants: GlobalRuleGrants) {
    throw new UnimplementedError()
  }
}

@Resolver(of => GlobalRulePermissions)
export class GlobalRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: GlobalRule) {
    throw new UnimplementedError()
  }
}
