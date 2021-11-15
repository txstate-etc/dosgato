import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root, Arg, Mutation } from 'type-graphql'
import { PageTree } from '../pagetree'
import { Role, RoleService } from '../role'
import { Site, SiteService } from '../site'
import { PageRule, PageRuleGrants, PageRulePermissions, PageRuleResponse } from './pagerule.model'
import { isNull } from 'txstate-utils'

@Resolver(of => PageRule)
export class PageRuleResolver {
  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites. For multiple sites, make multiple rules.' })
  async site (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    if (isNull(pagerule.siteId)) return null
    else return await ctx.svc(SiteService).findById(pagerule.siteId)
  }

  @FieldResolver(returns => PageTree, { nullable: true, description: 'The pagetree to which this rule applies. Null if it applies to all pagetrees. Note that specifying a pagetree also implies specifying a site. For multiple pagetrees, make multiple rules.' })
  async pagetree (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    throw new UnimplementedError()
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
  async addPageRule (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('grants', type => PageRuleGrants) grants: PageRuleGrants) {
    throw new UnimplementedError()
  }

  @Mutation(returns => PageRuleResponse)
  async updatePageRule (@Ctx() ctx: Context, @Arg('ruleId', type => String) ruleId: string, @Arg('grants', type => PageRuleGrants) grants: PageRuleGrants) {
    throw new UnimplementedError()
  }
}

@Resolver(of => PageRulePermissions)
export class PageRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the pagetree, path, or grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: PageRule) {
    throw new UnimplementedError()
  }
}
