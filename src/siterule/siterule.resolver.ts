import { Context } from '@txstate-mws/graphql-server'
import { isNull } from 'txstate-utils'
import { Resolver, Ctx, FieldResolver, Root, Mutation, Arg } from 'type-graphql'
import {
  Role, RoleService, Site, SiteService, CreateSiteRuleInput, SiteRule,
  SiteRulePermissions, SiteRuleResponse, UpdateSiteRuleInput, SiteRuleService
} from 'internal'

@Resolver(of => SiteRule)
export class SiteRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() siterule: SiteRule) {
    return await ctx.svc(RoleService).getRoleForRule(siterule.roleId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site targeted by this rule. Null means it targets all sites.' })
  async site (@Ctx() ctx: Context, @Root() siterule: SiteRule) {
    if (isNull(siterule.siteId)) return null
    else return await ctx.svc(SiteService).findById(siterule.siteId)
  }

  @FieldResolver(returns => SiteRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() siterule: SiteRule) {
    return siterule
  }

  @Mutation(returns => SiteRuleResponse)
  async createSiteRule (@Ctx() ctx: Context, @Arg('args', type => CreateSiteRuleInput) args: CreateSiteRuleInput) {
    return await ctx.svc(SiteRuleService).create(args)
  }

  @Mutation(returns => SiteRuleResponse)
  async updateSiteRule (@Ctx() ctx: Context, @Arg('args', type => UpdateSiteRuleInput) args: UpdateSiteRuleInput) {
    return await ctx.svc(SiteRuleService).update(args)
  }
}

@Resolver(of => SiteRulePermissions)
export class SiteRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: SiteRule) {
    return await ctx.svc(SiteRuleService).mayWrite(rule)
  }
}
