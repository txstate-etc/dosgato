import { Context } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql'
import { Site, Organization, OrganizationService, OrganizationResponse, OrganizationFilter, SiteServiceInternal } from '../internal.js'

@Resolver(of => Organization)
export class OrganizationResolver {
  @Query(returns => [Organization])
  async organizations (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: OrganizationFilter) {
    return await ctx.svc(OrganizationService).find(filter)
  }

  @FieldResolver(returns => [Site])
  async sites (@Ctx() ctx: Context, @Root() org: Organization) {
    return await ctx.svc(SiteServiceInternal).findByOrganization(org)
  }

  @FieldResolver(returns => [Organization])
  async ancestors (
    @Ctx() ctx: Context,
    @Root() org: Organization,
    @Arg('topDown', { nullable: true, description: 'If true, the list will be ordered from the largest organization down to the immediate parent. Default is false, meaning the immediate parent is first and the largest organization is last.' }) topDown?: boolean,
    @Arg('indexes', type => [Number], { nullable: true, description: 'If provided, only the ancestors at these indexes will be returned. For instance, if you only want the grandparent, provide [1] (0 is the immediate parent). Alternatively, if you want the next-to-largest organization (VP-level), set topDown to true and indexes to [1] ([0] is for the largest organization).' }) indexes?: number[]
  ) {
    return await ctx.svc(OrganizationService).findAncestors(org.id, topDown, indexes)
  }

  @Mutation(returns => OrganizationResponse)
  async createOrganization (@Ctx() ctx: Context,
    @Arg('name') name: string,
    @Arg('id', type => ID, { nullable: true, description: 'If the organization list is kept in sync with another system, like SAP, this field can be set with the organization\'s unique ID in that other system. If not set the default is to assign a unique id automatically.' }) id?: string
  ) {
    return await ctx.svc(OrganizationService).create(name, id)
  }
}
