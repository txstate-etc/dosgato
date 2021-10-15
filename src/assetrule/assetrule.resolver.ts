import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role, RoleService } from '../role'
import { Site } from '../site'
import { AssetRule, AssetRulePermissions } from './assetrule.model'

@Resolver(of => AssetRule)
export class AssetRuleResolver {
  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites.' })
  async site (@Ctx() ctx: Context, @Root() assetrule: AssetRule) {
    throw new UnimplementedError()
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
}

@Resolver(of => AssetRulePermissions)
export class AssetRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the assettree, path, or grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: AssetRule) {
    throw new UnimplementedError()
  }
}
