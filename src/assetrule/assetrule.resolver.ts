import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Mutation, Root, Arg } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  Role, RoleService, Site, SiteService, AssetRule, AssetRulePermissions, AssetRuleResponse,
  CreateAssetRuleInput, UpdateAssetRuleInput, AssetRuleService
} from '../internal.js'

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
  async createAssetRule (@Ctx() ctx: Context, @Arg('args', type => CreateAssetRuleInput) args: CreateAssetRuleInput, @Arg('validateOnly', { nullable: true }) validateOnly?: boolean) {
    return await ctx.svc(AssetRuleService).create(args, validateOnly)
  }

  @Mutation(returns => AssetRuleResponse)
  async updateAssetRule (@Ctx() ctx: Context, @Arg('args', type => UpdateAssetRuleInput) args: UpdateAssetRuleInput) {
    return await ctx.svc(AssetRuleService).update(args)
  }
}

@Resolver(of => AssetRulePermissions)
export class AssetRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the assettree, path, or grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: AssetRule) {
    return await ctx.svc(AssetRuleService).mayWrite(rule)
  }
}
