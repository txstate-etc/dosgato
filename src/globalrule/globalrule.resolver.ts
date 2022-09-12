import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root, Mutation, Arg } from 'type-graphql'
import {
  Role, RoleService, GlobalRule, GlobalRulePermissions, CreateGlobalRuleInput,
  GlobalRuleResponse, GlobalRuleService, UpdateGlobalRuleInput
} from '../internal.js'

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
  async createGlobalRule (@Ctx() ctx: Context, @Arg('args', type => CreateGlobalRuleInput) args: CreateGlobalRuleInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(GlobalRuleService).create(args, validateOnly)
  }

  @Mutation(returns => GlobalRuleResponse)
  async updateGlobalRule (@Ctx() ctx: Context, @Arg('args', type => UpdateGlobalRuleInput) args: UpdateGlobalRuleInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(GlobalRuleService).update(args, validateOnly)
  }
}

@Resolver(of => GlobalRulePermissions)
export class GlobalRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: GlobalRule) {
    return await ctx.svc(GlobalRuleService).mayWrite(rule)
  }
}
