import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import { isNull } from 'txstate-utils'
import {
  AssetRule, AssetRuleService, AssetRuleFilter, DataRule, DataRuleService, GlobalRule, GlobalRuleService,
  PageRule, PageRuleService, SiteRule, SiteRuleFilter, SiteRuleService, Group, GroupFilter,
  GroupService, User, UserFilter, UserService, Role, RoleFilter, RoleInput, RolePermissions, RoleResponse,
  RoleService, TemplateRule, TemplateRuleFilter, TemplateRuleService, RuleType, Site,
  UrlSafeString, GlobalRuleServiceInternal, SiteRuleServiceInternal, AssetRuleServiceInternal,
  DataRuleServiceInternal, PageRuleServiceInternal, TemplateRuleServiceInternal, SiteServiceInternal,
  DataRuleFilter, PageRuleFilter
} from '../internal.js'

@Resolver(of => Role)
export class RoleResolver {
  @Query(returns => [Role])
  async roles (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: RoleFilter) {
    return await ctx.svc(RoleService).find(filter)
  }

  @FieldResolver(returns => [GlobalRule])
  async globalRules (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(GlobalRuleServiceInternal).findByRoleId(role.id)
  }

  @FieldResolver(returns => [SiteRule])
  async siteRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: SiteRuleFilter) {
    return await ctx.svc(SiteRuleServiceInternal).findByRoleId(role.id, filter)
  }

  @FieldResolver(returns => [AssetRule])
  async assetRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: AssetRuleFilter) {
    return await ctx.svc(AssetRuleServiceInternal).findByRoleId(role.id, filter)
  }

  @FieldResolver(returns => [DataRule])
  async dataRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: DataRuleFilter) {
    return await ctx.svc(DataRuleServiceInternal).findByRoleId(role.id, filter)
  }

  @FieldResolver(returns => [PageRule])
  async pageRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: PageRuleFilter) {
    return await ctx.svc(PageRuleServiceInternal).findByRoleId(role.id, filter)
  }

  @FieldResolver(returns => [TemplateRule])
  async templateRules (@Ctx() ctx: Context, @Root() role: Role, @Arg('filter', { nullable: true }) filter?: TemplateRuleFilter) {
    return await ctx.svc(TemplateRuleServiceInternal).findByRoleId(role.id, filter)
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

  @FieldResolver(returns => Site, { nullable: true, description: 'Returns the site associated with this role or null if the role is not associated with a particular site' })
  async site (@Ctx() ctx: Context, @Root() role: Role) {
    if (isNull(role.siteId)) return null
    else return await ctx.svc(SiteServiceInternal).findById(role.siteId)
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
  async createRole (@Ctx() ctx: Context, @Arg('input', type => RoleInput) input: RoleInput, @Arg('validateOnly', { nullable: true, description: 'Set to true to validate the input without saving it.' }) validateOnly?: boolean): Promise<RoleResponse> {
    return await ctx.svc(RoleService).create(input, validateOnly)
  }

  @Mutation(returns => RoleResponse, { description: 'Update a role\'s name, description, or site' })
  async updateRole (@Ctx() ctx: Context, @Arg('roleId', type => ID) roleId: string, @Arg('input', type => RoleInput) input: RoleInput, @Arg('validateOnly', { nullable: true, description: 'Set to true to validate the input without saving it.' }) validateOnly?: boolean): Promise<RoleResponse> {
    return await ctx.svc(RoleService).update(roleId, input, validateOnly)
  }

  @Mutation(returns => ValidatedResponse)
  async deleteRole (@Ctx() ctx: Context, @Arg('roleId', type => ID) roleId: string): Promise<RoleResponse> {
    return await ctx.svc(RoleService).delete(roleId)
  }

  @Mutation(returns => ValidatedResponse)
  async addRolesToUser (@Ctx() ctx: Context, @Arg('roleIds', type => [ID]) roleIds: string[], @Arg('userId', type => ID) userId: string) {
    return await ctx.svc(RoleService).addRolesToUser(roleIds, userId)
  }

  @Mutation(returns => ValidatedResponse)
  async assignRoleToUsers (@Ctx() ctx: Context, @Arg('roleId', type => ID) roleId: string, @Arg('userIds', type => [ID]) userIds: string[]) {
    return await ctx.svc(RoleService).assignRoleToUsers(roleId, userIds)
  }

  @Mutation(returns => ValidatedResponse)
  async removeRoleFromUser (@Ctx() ctx: Context, @Arg('roleId', type => ID) roleId: string, @Arg('userId', type => ID) userId: string) {
    return await ctx.svc(RoleService).removeRoleFromUser(roleId, userId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Add a role to groups' })
  async addRoleToGroups (@Ctx() ctx: Context, @Arg('groupIds', type => [ID]) groupIds: string[], @Arg('roleId', type => ID) roleId: string) {
    return await ctx.svc(RoleService).addRoleToGroups(groupIds, roleId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove a role from a group' })
  async removeRoleFromGroup (@Ctx() ctx: Context, @Arg('groupId', type => ID) groupId: string, @Arg('roleId', type => ID) roleId: string) {
    return await ctx.svc(RoleService).removeRoleFromGroup(groupId, roleId)
  }

  @Mutation(returns => ValidatedResponse)
  async removeRule (@Ctx() ctx: Context, @Arg('ruleId', type => ID) ruleId: string, @Arg('type', type => RuleType) type: RuleType) {
    switch (type) {
      case RuleType.ASSET:
        return await ctx.svc(AssetRuleService).delete(ruleId)
      case RuleType.DATA:
        return await ctx.svc(DataRuleService).delete(ruleId)
      case RuleType.GLOBAL:
        return await ctx.svc(GlobalRuleService).delete(ruleId)
      case RuleType.PAGE:
        return await ctx.svc(PageRuleService).delete(ruleId)
      case RuleType.SITE:
        return await ctx.svc(SiteRuleService).delete(ruleId)
      case RuleType.TEMPLATE:
        return await ctx.svc(TemplateRuleService).delete(ruleId)
      default:
        throw new Error(`Cannot remove rule. Rule type ${type as string} does not exist.`)
    }
  }
}

@Resolver(of => RolePermissions)
export class RolePermissionsResolver {
  @FieldResolver(type => Boolean, { description: 'Current user is able to rename this role.' })
  rename (@Ctx() ctx: Context, @Root() role: Role) {
    return ctx.svc(RoleService).mayUpdate(role)
  }

  @FieldResolver(type => Boolean, { description: 'Current user is able to delete this role.' })
  delete (@Ctx() ctx: Context, @Root() role: Role) {
    return ctx.svc(RoleService).mayDelete(role)
  }

  @FieldResolver(type => Boolean, {
    description: `Current user is able to create rules for this role. Note that the target of
each rule must also be checked for a permission of its own. A user must have both permissions
before creating a rule relating a role to a target.`
  })
  createRules (@Ctx() ctx: Context, @Root() role: Role) {
    return ctx.svc(RoleService).mayCreateRules(role)
  }

  @FieldResolver(type => Boolean, {
    description: 'Current user is able to assign this role to other users.'
  })
  async assign (@Ctx() ctx: Context, @Root() role: Role) {
    return await ctx.svc(RoleService).mayAssign(role)
  }
}
