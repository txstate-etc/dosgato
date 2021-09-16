import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Group, GroupService } from '../group'
import { Role } from '../role'
import { UrlSafeString } from '../scalars/urlsafestring'
import { User, UserAccess, UserFilter, UserPermissions } from './user.model'

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
    throw new UnimplementedError()
  }

  @FieldResolver(returns => UserPermissions)
  permissions (@Root() user: User) {
    return user
  }

  @FieldResolver(returns => UserAccess, { description: 'Should generally be used with the `self` filter. Shows that user is able to undertake certain global actions like creating sites, groups, or roles.  Once the site, group, or role exists, its `permissions` resolver can be used to determine authorization.' })
  access (@Root() user: User) {
    return user
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

@Resolver(of => UserAccess)
export class UserAccessResolver {
  @FieldResolver(returns => Boolean, { description: 'User is able to create groups.' })
  async createGroups (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to edit one or more groups and should therefore see the group management UI.' })
  async viewGroupManager (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to create roles.' })
  async createRoles (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to add rules to one or more roles and should therefore see the role management UI.' })
  async viewRoleManager (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to create sites.' })
  async createSites (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to edit pages in one or more sites and should therefore see the page management UI.' })
  async viewPageManager (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to edit assets in one or more sites and should therefore see the asset management UI.' })
  async viewAssetManager (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to create new types of data.' })
  async createDataTypes (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to edit data of one or more types and should therefore see the data management UI.' })
  async viewDataManager (@Ctx() ctx: Context, @Root() user: User) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'User is able to create global data entries of the specified type.' })
  async createGlobalData (@Ctx() ctx: Context, @Root() user: User, @Arg('type') type: UrlSafeString) {
    throw new UnimplementedError()
  }
}
