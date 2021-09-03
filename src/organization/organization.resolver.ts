import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Query, Resolver, Root } from 'type-graphql'
import { Site } from '../site'
import { Organization } from './organization.model'

@Resolver(of => Organization)
export class OrganizationResolver {
  @Query(returns => [Organization])
  async organizations (@Ctx() ctx: Context) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Site])
  async sites (@Ctx() ctx: Context, @Root() org: Organization) {
    throw new UnimplementedError()
  }
}
