import { Context } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql'
import { Site, SiteService, Organization, OrganizationService, OrganizationResponse, OrganizationFilter } from '../internal.js'

@Resolver(of => Organization)
export class OrganizationResolver {
  @Query(returns => [Organization])
  async organizations (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: OrganizationFilter) {
    return await ctx.svc(OrganizationService).find(filter)
  }

  @FieldResolver(returns => [Site])
  async sites (@Ctx() ctx: Context, @Root() org: Organization) {
    return await ctx.svc(SiteService).findByOrganization(org)
  }

  @Mutation(returns => OrganizationResponse)
  async createOrganization (@Ctx() ctx: Context,
    @Arg('name') name: string,
    @Arg('id', type => ID, { nullable: true, description: 'If the organization list is kept in sync with another system, like SAP, this field can be set with the organization\'s unique ID in that other system. If not set the default is to assign a unique id automatically.' }) id?: string
  ) {
    return await ctx.svc(OrganizationService).create(name, id)
  }
}
