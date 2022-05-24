import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import {
  Group, GroupService, Role, RoleService, User, UserFilter,
  UserPermissions, UserResponse, UpdateUserInput, UserService, UsersResponse
} from 'internal'

@Resolver(of => User)
export class UserResolver {
  @Query(returns => [User])
  async users (@Ctx() ctx: Context, @Arg('filter') filter: UserFilter) {
    return await ctx.svc(UserService).find(filter)
  }

  @FieldResolver(returns => [Group], { description: 'Groups related to the user, either directly or through a subgroup membership.' })
  async groups (@Ctx() ctx: Context, @Root() user: User, @Arg('direct', { nullable: true, description: 'true -> groups where user is direct member, false -> groups where the user is an indirect member but not a direct member, null -> all groups where the user is a member.' }) direct: boolean) {
    return await ctx.svc(GroupService).findByUserId(user.id, direct)
  }

  @FieldResolver(returns => [Role], { description: 'Roles related to the user, either directly or through a group.' })
  async roles (@Ctx() ctx: Context, @Root() user: User, @Arg('direct', { nullable: true, description: 'true -> only roles the user has directly, false -> only roles the user has indirectly and not directly, null -> all roles the user has.' }) direct: boolean) {
    return await ctx.svc(RoleService).findByUserId(user.id, direct)
  }

  @FieldResolver(returns => UserPermissions)
  permissions (@Root() user: User) {
    return user
  }

  @Mutation(returns => UserResponse)
  async updateUser (@Ctx() ctx: Context, @Arg('userId', type => ID) userId: string, @Arg('args', type => UpdateUserInput) args: UpdateUserInput) {
    return await ctx.svc(UserService).updateUser(userId, args)
  }

  @Mutation(returns => UsersResponse, { description: 'Disabled users will stay in the system with their previous roles and group memberships for referential integrity and easy re-enable.' })
  async disableUsers (@Ctx() ctx: Context, @Arg('userIds', type => [ID]) userIds: string[]) {
    return await ctx.svc(UserService).disableUsers(userIds)
  }

  @Mutation(returns => UsersResponse, { description: 'Re-enable users that have previously been disabled.' })
  async enableUsers (@Ctx() ctx: Context, @Arg('userIds', type => [ID]) userIds: string[]) {
    return await ctx.svc(UserService).enableUsers(userIds)
  }
}

@Resolver(of => UserPermissions)
export class UserPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user may update this user\'s name or email.' })
  async update (@Ctx() ctx: Context, @Root() user: User) {
    return await ctx.svc(UserService).mayUpdate(user)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may disable this account. Returns true even if account is already disabled.' })
  async disable (@Ctx() ctx: Context, @Root() user: User) {
    return await ctx.svc(UserService).mayDisable(user)
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may re-enable this account. Returns true even if account is already enabled.' })
  async enable (@Ctx() ctx: Context, @Root() user: User) {
    return await ctx.svc(UserService).mayCreate()
  }
}
