import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation } from 'type-graphql'
import { Group, GroupService } from '../group'
import { Role, RoleService } from '../role'
import { User, UserFilter, UserPermissions, UserResponse, UpdateUserInput } from './user.model'

import { UserService } from './user.service'

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
  async updateUser (@Ctx() ctx: Context, @Arg('args', type => UpdateUserInput) args: UpdateUserInput) {
    throw new UnimplementedError()
  }

  @Mutation(returns => UserResponse)
  async disableUser (@Ctx() ctx: Context) {
    throw new UnimplementedError()
  }

  @Mutation(returns => UserResponse)
  async enableUser (@Ctx() ctx: Context) {
    throw new UnimplementedError()
  }
}

@Resolver(of => UserPermissions)
export class UserPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user may update this user\'s name or email.' })
  async update (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may disable this account and remove all role and group memberships it has. The user row itself will stay in the database for referential integrity.' })
  async disable (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }
}
