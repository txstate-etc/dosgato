import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Ctx, FieldResolver, Root } from 'type-graphql'
import { Role, RoleService } from '../role'
import { Site } from '../site'
import { Template } from '../template'
import { DataRule, DataRulePermissions } from './datarule.model'

@Resolver(of => DataRule)
export class DataRuleResolver {
  @FieldResolver(returns => Role, { description: 'The role to which this rule belongs.' })
  async role (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    return await ctx.svc(RoleService).getRoleForRule(datarule.roleId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites.' })
  async site (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Template, { nullable: true, description: 'The data template to which this rule applies. Null if it applies to all data templates.' })
  async template (@Ctx() ctx: Context, @Root() datarule: DataRule) {
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
