import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, Mutation, Query, Resolver, Root, ID } from 'type-graphql'
import { Role, RoleService, User, UserService, Group, GroupPermissions, GroupResponse, GroupService } from 'internal'

@Resolver(of => Group)
export class GroupResolver {
  @Query(returns => [Group])
  async groups (@Ctx() ctx: Context) {
    return await ctx.svc(GroupService).find()
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

  @FieldResolver(returns => [User], { description: 'People who are authorized to add and remove members from the group.' })
  async managers (@Ctx() ctx: Context, @Root() group: Group) {
    return await ctx.svc(GroupService).getGroupManagers(group.id)
  }

  @FieldResolver(returns => GroupPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() group: Group) {
    return group
  }

  @Mutation(returns => GroupResponse, { description: 'Add a new group. The group name must be unique.' })
  async createGroup (@Ctx() ctx: Context, @Arg('name', { description: 'name of the group being created' }) name: string): Promise<GroupResponse> {
    return await ctx.svc(GroupService).create(name)
  }

  @Mutation(returns => GroupResponse, { description: 'Update the name of an existing group' })
  async updateGroup (@Ctx() ctx: Context, @Arg('groupId') groupId: string, @Arg('name') name: string) {
    return await ctx.svc(GroupService).update(groupId, name)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Delete a group' })
  async deleteGroup (@Ctx() ctx: Context, @Arg('groupId') groupId: string) {
    return await ctx.svc(GroupService).delete(groupId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Add a user to groups' })
  async addUserToGroups (@Ctx() ctx: Context, @Arg('groupIds', type => [ID]) groupIds: string[], @Arg('userId') userId: string) {
    return await ctx.svc(GroupService).addUserToGroups(groupIds, userId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove a user from a group' })
  async removeUserFromGroups (@Ctx() ctx: Context, @Arg('groupIds', type => [ID]) groupIds: string[], @Arg('userId') userId: string) {
    return await ctx.svc(GroupService).removeUserFromGroup(groupIds, userId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Sets a user\'s group memberships' })
  async setUserGroups (@Ctx() ctx: Context, @Arg('userId') userId: string, @Arg('groupIds', type => [ID]) groupIds: string[]) {
    return await ctx.svc(GroupService).setUserGroups(userId, groupIds)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Update a user\'s status as a manager of a group' })
  async setGroupManager (@Ctx() ctx: Context, @Arg('groupId') groupId: string, @Arg('userId') userId: string, @Arg('manager', { description: 'true if this user should be a group manager, false if they should not be a group manager' }) manager: boolean) {
    return await ctx.svc(GroupService).setGroupManager(groupId, userId, manager)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Make one group a subgroup of another' })
  async addSubgroup (@Ctx() ctx: Context, @Arg('parentGroupId') parentGroupId: string, @Arg('childGroupId') childGroupId: string) {
    return await ctx.svc(GroupService).addSubgroup(parentGroupId, childGroupId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Remove relationship between a group and subgroup' })
  async removeSubgroup (@Ctx() ctx: Context, @Arg('parentGroupId') parentGroupId: string, @Arg('childGroupId') childGroupId: string) {
    return await ctx.svc(GroupService).removeSubgroup(parentGroupId, childGroupId)
  }
}

@Resolver(of => GroupPermissions)
export class GroupPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove users.' })
  async manageUsers (@Ctx() ctx: Context, @Root() group: Group) {
    return await ctx.svc(GroupService).mayManageUsers(group)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove subgroups.' })
  async manageGroups (@Ctx() ctx: Context, @Root() group: Group) {
    return await ctx.svc(GroupService).mayManageGroups(group)
  }
}
