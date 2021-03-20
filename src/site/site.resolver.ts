import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { PageRule, PageRuleFilter } from '../pagerule'
import { PageTree } from '../pagetree'
import { Site, SiteFilter, SitePermissions } from './site.model'

@Resolver(of => Site)
export class SiteResolver {
  @Query(returns => [Site])
  async sites (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: SiteFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree])
  async pagetrees (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageRule], { description: 'All pagerules that apply to pages in this site.' })
  async pagerules (@Ctx() ctx: Context, @Root() pagetree: PageTree, @Arg('filter', { nullable: true }) filter?: PageRuleFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => SitePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() site: Site) {
    return site
  }
}

@Resolver(of => SitePermissions)
export class SitePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set or update the public URL for this site.' })
  async launch (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to rename this site.' })
  async rename (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to create a new pagetree such as a sandbox or archive in this site.' })
  async createPagetree (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to promote a pagetree (e.g. a sandbox) to be the live pagetree for this site.' })
  async promotePagetree (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to soft-delete this site.' })
  async delete (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => Boolean, { description: 'Current user has permission to un-delete this site. Returns false unless the site is currently soft-deleted.' })
  async undelete (@Ctx() ctx: Context, @Root() site: Site) {
    throw new UnimplementedError()
  }
}
