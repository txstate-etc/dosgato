import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root, Arg, Mutation } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  Role, RoleService, Site, CreatePageRuleInput, PageRule,
  PageRulePermissions, PageRuleResponse, UpdatePageRuleInput, PageRuleService, SiteServiceInternal
} from '../internal.js'

@Resolver(of => PageRule)
export class PageRuleResolver {
  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites. For multiple sites, make multiple rules.' })
  async site (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    if (isNull(pagerule.siteId)) return null
    else return await ctx.svc(SiteServiceInternal).findById(pagerule.siteId)
  }

  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    return await ctx.svc(RoleService).getRoleForRule(pagerule.roleId)
  }

  @FieldResolver(returns => PageRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() pagerule: PageRule) {
    return pagerule
  }

  @Mutation(returns => PageRuleResponse)
  async createPageRule (@Ctx() ctx: Context, @Arg('args', type => CreatePageRuleInput) args: CreatePageRuleInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(PageRuleService).create(args, validateOnly)
  }

  @Mutation(returns => PageRuleResponse)
  async updatePageRule (@Ctx() ctx: Context, @Arg('args', type => UpdatePageRuleInput) args: UpdatePageRuleInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(PageRuleService).update(args, validateOnly)
  }
}

@Resolver(of => PageRulePermissions)
export class PageRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the pagetree, path, or grants on this rule.\n\nThis will be false if the rule has more power than the user currently has. Even if this is true, the rule may not be upgraded to have more permission than they already have.' })
  async write (@Ctx() ctx: Context, @Root() rule: PageRule) {
    return await ctx.svc(PageRuleService).mayWrite(rule)
  }
}
