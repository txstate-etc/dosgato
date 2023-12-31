import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, Mutation, Query, Resolver, Root, ID } from 'type-graphql'
import { Role, RoleService, User, UserService, Group, GroupFilter, GroupPermissions, GroupResponse, GroupService } from '../internal.js'

@Resolver(of => Group)
export class GroupResolver {
  @Query(returns => [Group])
  async groups (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: GroupFilter) {
    return await ctx.svc(GroupService).find(filter)
  }

  @FieldResolver(returns => [User], { description: 'Users that are members of this group, either directly or through a subgroup.' })
  async users (@Ctx() ctx: Context, @Root() group: Group, @Arg('direct', { nullable: true, description: 'true -> only direct members, false -> only indirect members, null -> all members' }) direct?: boolean) {
    return await ctx.svc(UserService).findByGroupId(group.id, direct)
  }

  @FieldResolver(returns => [Group], { description: 'Groups that have been added to this group so that all their members are also members of this group.' })
  async subgroups (@Ctx() ctx: Context, @Root() group: Group, @Arg('recursive', { nullable: true }) recursive?: boolean) {
    return await ctx.svc(GroupService).getSubgroups(group.id, recursive)
  }

  @FieldResolver(returns => [Role], { description: 'Roles this group has either directly or through a parent group.' })
  async roles (@Ctx() ctx: Context, @Root() group: Group, @Arg('direct', { nullable: true, description: 'true -> only roles added directly, false -> only indirect roles, null -> all roles' }) direct?: boolean) {
    return await ctx.svc(RoleService).findByGroupId(group.id, direct)
  }

  @FieldResolver(returns => [Group], { nullable: true, description: 'Returns ancestor group(s), or null if this group is not a subgroup' })
  async supergroups (@Ctx() ctx: Context, @Root() group: Group, @Arg('recursive', { nullable: true, description: 'If false, return only the parent groups' }) recursive?: boolean) {
    return await ctx.svc(GroupService).getSuperGroups(group.id, recursive)
  }

  @FieldResolver(returns => GroupPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() group: Group) {
    return group
  }

  @Mutation(returns => GroupResponse, { description: 'Add a new group. The group name must be unique.' })
  async createGroup (@Ctx() ctx: Context, @Arg('name', { description: 'name of the group being created' }) name: string,
    @Arg('parentId', type => ID, { nullable: true, description: 'Optional parent group ID, if creating a new subgroup' }) parentId?: string,
    @Arg('validateOnly', { nullable: true, description: 'Set to true to validate the input without saving it.' }) validateOnly?: boolean): Promise<GroupResponse> {
    return await ctx.svc(GroupService).create(name, parentId, validateOnly)
  }

  @Mutation(returns => GroupResponse, { description: 'Update the name of an existing group' })
  async updateGroup (@Ctx() ctx: Context, @Arg('groupId', type => ID) groupId: string,
    @Arg('name') name: string,
    @Arg('validateOnly', { nullable: true, description: 'Set to true to validate the input without saving it.' }) validateOnly?: boolean) {
    return await ctx.svc(GroupService).update(groupId, name, validateOnly)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Delete a group' })
  async deleteGroup (@Ctx() ctx: Context, @Arg('groupId', type => ID) groupId: string) {
    return await ctx.svc(GroupService).delete(groupId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Add a user to groups' })
  async addUserToGroups (@Ctx() ctx: Context, @Arg('groupIds', type => [ID]) groupIds: string[], @Arg('userId', type => ID) userId: string) {
    return await ctx.svc(GroupService).addUserToGroups(groupIds, userId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove a user from a group' })
  async removeUserFromGroups (@Ctx() ctx: Context, @Arg('groupIds', type => [ID]) groupIds: string[], @Arg('userId', type => ID) userId: string) {
    return await ctx.svc(GroupService).removeUserFromGroup(groupIds, userId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Sets a user\'s group memberships' })
  async setUserGroups (@Ctx() ctx: Context, @Arg('userId', type => ID) userId: string, @Arg('groupIds', type => [ID]) groupIds: string[]) {
    return await ctx.svc(GroupService).setUserGroups(userId, groupIds)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Sets the members for a group' })
  async setGroupUsers (@Ctx() ctx: Context, @Arg('groupId', type => ID) groupId: string, @Arg('userIds', type => [ID]) userIds: string[]) {
    return await ctx.svc(GroupService).setGroupUsers(groupId, userIds)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Make one group a subgroup of another' })
  async addSubgroup (@Ctx() ctx: Context, @Arg('parentGroupId', type => ID) parentGroupId: string, @Arg('childGroupId', type => ID) childGroupId: string) {
    return await ctx.svc(GroupService).addSubgroup(parentGroupId, childGroupId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove relationship between a group and subgroup' })
  async removeSubgroup (@Ctx() ctx: Context, @Arg('parentGroupId', type => ID) parentGroupId: string, @Arg('childGroupId', type => ID) childGroupId: string) {
    return await ctx.svc(GroupService).removeSubgroup(parentGroupId, childGroupId)
  }
}

@Resolver(of => GroupPermissions)
export class GroupPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove users.' })
  manageUsers (@Ctx() ctx: Context, @Root() group: Group) {
    return ctx.svc(GroupService).mayManageUsers(group)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove subgroups.' })
  manageGroups (@Ctx() ctx: Context, @Root() group: Group) {
    return ctx.svc(GroupService).mayManageGroups(group)
  }
}
