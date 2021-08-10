import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role } from '../role'
import { Site } from '../site'
import { DataRule, DataRulePermissions } from './datarule.model'

@Resolver(of => DataRule)
export class DataRuleResolver {
  @FieldResolver(returns => Role)
  async role (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Site, { nullable: true })
  async site (@Ctx() ctx: Context, @Root() datarule: DataRule) {
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
