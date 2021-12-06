import { Context, UnimplementedError, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { AssetRule, AssetRuleService } from '../assetrule'
import { DataRule, DataRuleService } from '../datarule'
import { GlobalRule, GlobalRuleService } from '../globalrule'
import { PageRule, PageRuleService } from '../pagerule'
import { SiteRule, SiteRuleFilter, SiteRuleService } from '../siterule'
import { Group, GroupFilter, GroupService } from '../group'
import { User, UserFilter, UserService } from '../user'
import { Role, RoleFilter, RolePermissions, RoleResponse } from './role.model'
import { RoleService } from './role.service'
import { TemplateRule, TemplateRuleFilter, TemplateRuleService } from '../templaterule'

@Resolver(of => Role)
export class RoleResolver {
  @Query(returns => [Role])
  async roles (@Ctx() ctx: Context, @Arg('filter') filter: RoleFilter) {
    return await ctx.svc(RoleService).find(filter)
  }

  @FieldResolver(returns => [GlobalRule])
  async globalRules (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(GlobalRuleService).getRules(role.id)
  }

  @FieldResolver(returns => [SiteRule])
  async siteRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: SiteRuleFilter) {
    return await ctx.svc(SiteRuleService).findByRoleId(role.id, filter)
  }

  @FieldResolver(returns => [AssetRule])
  async assetRules (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(AssetRuleService).getRules(role.id)
  }

  @FieldResolver(returns => [DataRule])
  async dataRules (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(DataRuleService).getRules(role.id)
  }

  @FieldResolver(returns => [PageRule])
  async pageRules (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(PageRuleService).findByRoleId(role.id)
  }

  @FieldResolver(returns => [TemplateRule])
  async templateRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: TemplateRuleFilter) {
    return await ctx.svc(TemplateRuleService).getRules(role.id, filter)
  }

  @FieldResolver(returns => [User], { description: 'Returns a list of all users related to the role, either directly or through a group.' })
  async users (@Ctx() ctx: Context, @Root() role: Role,
    @Arg('direct', { nullable: true, description: 'true -> only users that have the role directly, false -> only users that have the role indirectly and not directly, null -> all users that have the role.' }) direct?: boolean,
    @Arg('filter', { nullable: true }) filter?: UserFilter) {
    return await ctx.svc(UserService).findByRoleId(role.id, direct, filter)
  }

  @FieldResolver(returns => [Group], { description: 'Returns a list of all groups related to the role, either directly or through a parent group.' })
  async groups (@Ctx() ctx: Context, @Root() role: Role,
    @Arg('direct', { nullable: true, description: 'true -> only groups that have the role directly, false -> only groups that have the role indirectly and not directly, null -> all groups that have the role.' }) direct?: boolean,
    @Arg('filter', { nullable: true }) filter?: GroupFilter
  ) {
    return await ctx.svc(GroupService).findByRoleId(role.id, direct, filter)
  }

  @FieldResolver(returns => RolePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() role: Role) {
    return role
  }

  // MUTATIONS
  @Mutation(returns => RoleResponse)
  async createRole (@Ctx() ctx: Context, @Arg('name', { description: 'name of the role being created' }) name: string): Promise<RoleResponse> {
    throw new UnimplementedError()
  }

  @Mutation(returns => RoleResponse, { description: 'Give a role a new name' })
  async updateRole (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('name') name: string): Promise<RoleResponse> {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async deleteRole (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string): Promise<RoleResponse> {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async assignRoleToUser (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('userId') userId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async removeRoleFromUser (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('userId') userId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async assignRoleToGroup (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('groupId') groupId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async removeRoleFromGroup (@Ctx() ctx: Context, @Arg('roleId', type => String) roleId: string, @Arg('groupId') groupId: string) {
    throw new UnimplementedError()
  }

  @Mutation(returns => ValidatedResponse)
  async removeRule (@Ctx() ctx: Context, @Arg('ruleId', type => String) ruleId: string) {
    throw new UnimplementedError()
  }
}

@Resolver(of => RolePermissions)
export class RolePermissionsResolver {
  @FieldResolver(type => Boolean, { description: 'Current user is able to rename this role.' })
  async rename (@Ctx() ctx: Context, @Root() role: Role) {
    throw new UnimplementedError()
  }

  @FieldResolver(type => Boolean, { description: 'Current user is able to delete this role.' })
  async delete (@Ctx() ctx: Context, @Root() role: Role) {
    throw new UnimplementedError()
  }

  @FieldResolver(type => Boolean, {
    description: `Current user is able to create rules for this role. Note that the target of
each rule must also be checked for a permission of its own. A user must have both permissions
before creating a rule relating a role to a target.`
  })
  async createRules (@Ctx() ctx: Context, @Root() role: Role) {
    throw new UnimplementedError()
  }
}
