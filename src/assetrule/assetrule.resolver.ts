import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role } from '../role'
import { Site } from '../site'
import { AssetRule, AssetRuleFilter, AssetRulePermissions } from './assetrule.model'

@Resolver(of => AssetRule)
export class AssetRuleResolver {
  @Query(returns => [AssetRule])
  async assetrules (@Ctx() ctx: Context, @Arg('filter') filter: AssetRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site, { nullable: true })
  async site (@Ctx() ctx: Context, @Root() assetrule: AssetRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() assetrule: AssetRule) {
    throw new UnimplementedError()
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
