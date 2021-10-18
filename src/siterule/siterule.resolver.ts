import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role, RoleService } from '../role'
import { Site, SiteService } from '../site'
import { SiteRule, SiteRulePermissions } from './siterule.model'
import { isNull } from 'txstate-utils'

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
}

@Resolver(of => SiteRulePermissions)
export class SiteRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: SiteRule) {
    throw new UnimplementedError()
  }
}
