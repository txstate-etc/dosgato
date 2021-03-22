import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role } from '../role'
import { DataRule, DataRuleFilter, DataRulePermissions } from './datarule.model'

@Resolver(of => DataRule)
export class DataRuleResolver {
  @Query(returns => [DataRule])
  async datarules (@Ctx() ctx: Context, @Arg('filter') filter: DataRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => DataRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() datarule: DataRule) {
    return datarule
  }
}

@Resolver(of => DataRulePermissions)
export class DataRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: DataRule) {
    throw new UnimplementedError()
  }
}
