import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Group, GroupFilter } from '../group'
import { User, UserFilter } from '../user'
import { Role, RoleFilter, RolePermissions, Rule, RuleType } from './role.model'
import { RoleService } from './role.service'

@Resolver(of => Role)
export class RoleResolver {
  @Query(returns => [Role])
  async roles (@Ctx() ctx: Context, @Arg('filter') filter: RoleFilter) {
    return await ctx.svc(RoleService).find(filter)
  }

  @FieldResolver(returns => [Rule])
  async rules (@Ctx() ctx: Context, @Root() role: Role, @Arg('types', type => [RuleType]) types: RuleType[]) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User], { description: 'Returns a list of all users related to the role, either directly or through a group.' })
  async users (@Ctx() ctx: Context, @Root() role: Role,
    @Arg('direct', { nullable: true, description: 'true -> only users that have the role directly, false -> only users that have the role indirectly and not directly, null -> all users that have the role.' }) direct?: boolean,
    @Arg('filter', { nullable: true }) filter?: UserFilter
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Group], { description: 'Returns a list of all groups related to the role, either directly or through a parent group.' })
  async groups (@Ctx() ctx: Context, @Root() role: Role,
    @Arg('direct', { nullable: true, description: 'true -> only groups that have the role directly, false -> only groups that have the role indirectly and not directly, null -> all groups that have the role.' }) direct?: boolean,
    @Arg('filter', { nullable: true }) filter?: GroupFilter
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => RolePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() role: Role) {
    return role
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
