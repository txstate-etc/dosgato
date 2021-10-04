import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root } from 'type-graphql'
import { Data, DataFilter } from '../data'
import { PageFilter } from '../page'
import { PageTree } from '../pagetree'
import { Template, TemplateFilter, TemplatePermissions } from './template.model'
import { TemplateService } from './template.service'

@Resolver(of => Template)
export class TemplateResolver {
  @Query(returns => [Template])
  async templates (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    return await ctx.svc(TemplateService).find(filter)
  }

  @FieldResolver(returns => [PageTree])
  async pagetrees (@Ctx() ctx: Context, @Root() template: Template,
    @Arg('direct', {
      nullable: true,
      description: `
        Since a template can be authorized for a whole site or directly for a single pagetree in a site,
        this argument allows you to specify whether you only want to see the pagetrees authorized directly
        or all pagetrees that would be authorized to use the template.`
    }) direct?: boolean
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree], { description: 'All pages using this template. Empty array for data templates.' })
  async pages (@Ctx() ctx: Context, @Root() template: Template, @Arg('filter', { nullable: true }) filter?: PageFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [PageTree], { description: 'All sites that are permitted to use this template.' })
  async sites (@Ctx() ctx: Context, @Root() template: Template,
    @Arg('atLeastOneTree', {
      nullable: true,
      description: 'A template may be linked to a whole site or an individual pagetree. By default this resolver only returns sites where the whole site is able to use the template. Use this toggle to also return any sites where one or more pagetrees are able to use the template. Ignored for data templates.'
    }) atLeastOneTree?: boolean
  ) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => [Data], { description: 'All data entries that use this template. Empty array for page or component templates.' })
  async data (@Ctx() ctx: Context, @Root() template: Template, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    throw new UnimplementedError()
  }

  @FieldResolver(returns => TemplatePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() template: Template) {
    return template
  }
}

@Resolver(of => TemplatePermissions)
export class TemplatePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Current user has permission to set or update the public URL for this template.' })
  async assign (@Ctx() ctx: Context, @Root() template: Template) {
    throw new UnimplementedError()
  }
}
