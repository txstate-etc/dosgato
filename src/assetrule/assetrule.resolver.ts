import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Mutation, Root, Arg } from 'type-graphql'
import { Role, RoleService } from '../role'
import { Site, SiteService } from '../site'
import { AssetRule, AssetRuleGrants, AssetRulePermissions, AssetRuleResponse } from './assetrule.model'
import { isNull } from 'txstate-utils'

@Resolver(of => AssetRule)
export class AssetRuleResolver {
  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites.' })
  async site (@Ctx() ctx: Context, @Root() assetrule: AssetRule) {
    if (isNull(assetrule.siteId)) return null
    else return await ctx.svc(SiteService).findById(assetrule.siteId)
  }

  @FieldResolver(returns => Role, { description: 'The role to which this rule belongs.' })
  async role (@Ctx() ctx: Context, @Root() assetrule: AssetRule) {
    return await ctx.svc(RoleService).getRoleForRule(assetrule.roleId)
  }

  @FieldResolver(returns => AssetRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() assetrule: AssetRule) {
    return assetrule
  }

  @Mutation(returns => AssetRuleResponse)
  async addAssetRule (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('grants', type => AssetRuleGrants) grants: AssetRuleGrants) {
    throw new UnimplementedError()
  }

  @Mutation(returns => AssetRuleResponse)
  async updateAssetRule (@Ctx() ctx: Context, @Arg('ruleId', type => String) ruleId: string, @Arg('grants', type => AssetRuleGrants) grants: AssetRuleGrants) {
    throw new UnimplementedError()
  }
}

@Resolver(of => AssetRulePermissions)
export class AssetRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the assettree, path, or grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: AssetRule) {
    throw new UnimplementedError()
  }
}
