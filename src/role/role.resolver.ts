import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { PageTree } from '../pagetree'
import { Role, RoleFilter, RolePermissions } from './role.model'

@Resolver(of => Role)
export class RoleResolver {
  @Query(returns => [Role])
  async roles (@Ctx() ctx: Context, @Arg('filter') filter: RoleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree])
  async pagetrees (@Ctx() ctx: Context, @Root() role: Role) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => RolePermissions)
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
