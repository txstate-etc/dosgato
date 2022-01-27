import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Arg, Resolver, Ctx, Mutation, FieldResolver, Root } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  Role, RoleService, Site, SiteService, Template, CreateDataRuleInput,
  DataRule, DataRulePermissions, DataRuleResponse, UpdateDataRuleInput,
  TemplateService
} from 'internal'

@Resolver(of => DataRule)
export class DataRuleResolver {
  @FieldResolver(returns => Role, { description: 'The role to which this rule belongs.' })
  async role (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    return await ctx.svc(RoleService).getRoleForRule(datarule.roleId)
  }

  @FieldResolver(returns => Site, { nullable: true, description: 'The site to which this rule applies. Null if it applies to all sites.' })
  async site (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    if (isNull(datarule.siteId)) return null
    else return await ctx.svc(SiteService).findById(datarule.siteId)
  }

  @FieldResolver(returns => Template, { nullable: true, description: 'The data template to which this rule applies. Null if it applies to all data templates.' })
  async template (@Ctx() ctx: Context, @Root() datarule: DataRule) {
    if (isNull(datarule.templateId)) return null
    else return await ctx.svc(TemplateService).findById(datarule.templateId)
  }

  @FieldResolver(returns => DataRulePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() datarule: DataRule) {
    return datarule
  }

  @Mutation(returns => DataRuleResponse)
  async createDataRule (@Ctx() ctx: Context, @Arg('args', type => CreateDataRuleInput) args: CreateDataRuleInput) {
    throw new UnimplementedError()
  }

  @Mutation(returns => DataRuleResponse)
  async updateDataRule (@Ctx() ctx: Context, @Arg('args', type => UpdateDataRuleInput) args: UpdateDataRuleInput) {
    throw new UnimplementedError()
  }
}

@Resolver(of => DataRulePermissions)
export class DataRulePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit the grants on this rule.' })
  async write (@Ctx() ctx: Context, @Root() rule: DataRule) {
    throw new UnimplementedError()
  }
}
