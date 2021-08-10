import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, Query, Resolver, Root } from 'type-graphql'
import { User } from '../user'
import { Group, GroupPermissions } from './group.model'

@Resolver(of => Group)
export class GroupResolver {
  @Query(returns => [Group])
  async groups (@Ctx() ctx: Context) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User], { description: 'Users that are members of this group, either directly or through a subgroup.' })
  async users (@Ctx() ctx: Context, @Root() group: Group, @Arg('direct', { nullable: true, description: 'true -> only direct members, false -> only indirect members, null -> all members' }) direct: Boolean) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Group], { description: 'Groups that have been added to this group so that all their members are also members of this group.' })
  async subgroups (@Ctx() ctx: Context, @Root() group: Group, @Arg('direct', { nullable: true, description: 'true -> only subgroups added directly, false -> only indirect subgroups, null -> all subgroups' }) direct: Boolean) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [User], { description: 'People who are authorized to add and remove members from the group.' })
  async managers (@Ctx() ctx: Context, @Root() group: Group) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => GroupPermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() group: Group) {
    return group
  }
}

@Resolver(of => GroupPermissions)
export class GroupPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove users.' })
  async manageusers () {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user may add and remove subgroups.' })
  async managegroups () {
    throw new UnimplementedError()
  }
}
