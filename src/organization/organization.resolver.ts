import { Context } from '@txstate-mws/graphql-server'
import { Ctx, FieldResolver, Query, Resolver, Root } from 'type-graphql'
import { Site, SiteService, Organization, OrganizationService } from '../internal.js'

@Resolver(of => Organization)
export class OrganizationResolver {
  @Query(returns => [Organization])
  async organizations (@Ctx() ctx: Context) {
    return await ctx.svc(OrganizationService).find()
  }

  @FieldResolver(returns => [Site])
  async sites (@Ctx() ctx: Context, @Root() org: Organization) {
    return await ctx.svc(SiteService).findByOrganization(org.id)
  }
}
