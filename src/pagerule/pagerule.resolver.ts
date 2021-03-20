import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { PageTree } from '../pagetree'
import { Role } from '../role'
import { Site } from '../site'
import { PageRule, PageRuleFilter, PageRulePermissions } from './pagerule.model'

@Resolver(of => PageRule)
export class PageRuleResolver {
  @Query(returns => [PageRule])
  async pagerules (@Ctx() ctx: Context, @Arg('filter') filter: PageRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site, { nullable: true })
  async site (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PageTree, { nullable: true })
  async pagetree (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() pagerule: PageRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => PageRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() pagerule: PageRule) {
    return pagerule
  }
}

@Resolver(of => PageRulePermissions)
export class PageRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the pagetree, path, or grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: PageRule) {
    throw new UnimplementedError()
  }
}
