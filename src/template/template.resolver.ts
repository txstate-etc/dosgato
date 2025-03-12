import { Context, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import {
  Data, DataFilter, DataService, Page, PageFilter, Pagetree, PagetreeService, Site,
  PageService, Template, TemplateArea, TemplateFilter, TemplatePermissions, TemplateService, TemplateType, SiteServiceInternal
} from '../internal.js'

@Resolver(of => Template)
export class TemplateResolver {
  @Query(returns => [Template])
  async templates (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: TemplateFilter) {
    return await ctx.svc(TemplateService).find(filter)
  }

  @FieldResolver(returns => [Pagetree])
  async pagetrees (@Ctx() ctx: Context, @Root() template: Template,
    @Arg('direct', {
      nullable: true,
      description: `
        Since a template can be authorized for a whole site or directly for a single pagetree in a site,
        this argument allows you to specify whether you only want to see the pagetrees authorized directly
        or all pagetrees that would be authorized to use the template.`
    }) direct?: boolean
  ) {
    return await ctx.svc(PagetreeService).findByTemplateId(template.id, direct)
  }

  @FieldResolver(returns => [Page], { description: 'All pages using this template. Empty array for data templates.' })
  async pages (@Ctx() ctx: Context, @Root() template: Template, @Arg('filter', { nullable: true }) filter?: PageFilter) {
    if (template.type === TemplateType.DATA) return []
    else {
      return await ctx.svc(PageService).findByTemplate(template.key, filter)
    }
  }

  @FieldResolver(returns => [Site], { description: 'All sites that are permitted to use this template.' })
  async sites (@Ctx() ctx: Context, @Root() template: Template,
    @Arg('atLeastOneTree', {
      nullable: true,
      description: 'A template may be linked to a whole site or an individual pagetree. By default this resolver only returns sites where the whole site is able to use the template. Use this toggle to also return any sites where one or more pagetrees are able to use the template. Ignored for data templates.'
    }) atLeastOneTree?: boolean
  ) {
    return await ctx.svc(SiteServiceInternal).findByTemplateId(template.id, atLeastOneTree)
  }

  @FieldResolver(returns => [Data], { description: 'All data entries that use this template. Empty array for page or component templates.' })
  async data (@Ctx() ctx: Context, @Root() template: Template, @Arg('filter', { nullable: true }) filter?: DataFilter) {
    if (template.type !== TemplateType.DATA) return []
    else {
      return await ctx.svc(DataService).findByTemplate(template.key, filter)
    }
  }

  @FieldResolver(returns => [Template], { description: 'Page templates that allow this template in one of their areas. Empty array for page or data templates.' })
  async rootPageTemplates (@Ctx() ctx: Context, @Root() template: Template) {
    if (template.type !== TemplateType.COMPONENT) return []
    return await ctx.svc(TemplateService).getRootPageTemplates(template.key)
  }

  @FieldResolver(returns => TemplatePermissions, {
    description: `Reveal the simplified results after all authorization rules are taken into account
      for the current user. Makes it easy to light up, disable, or hide buttons in the UI.`
  })
  permissions (@Root() template: Template) {
    return template
  }

  @Mutation(returns => ValidatedResponse, { description: 'Authorize a template for a site. If this template is already authorized for pagetrees within the site, those authorizations will be removed because site-level authorization supersedes them.' })
  async authorizeTemplateForSite (@Ctx() ctx: Context, @Arg('templateKey', type => ID) templateKey: string, @Arg('siteId', type => ID) siteId: string) {
    return await ctx.svc(TemplateService).authorizeForSite(templateKey, siteId)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Authorize a template for one or more pagetrees in a site. If the template is already authorized for the whole site, that authorization will be removed.' })
  async authorizeTemplateForPagetrees (@Ctx() ctx: Context, @Arg('templateKey', type => ID) templateKey: string, @Arg('pagetreeIds', type => [ID]) pagetreeIds: string[]) {
    return await ctx.svc(TemplateService).authorizeForPagetrees(templateKey, pagetreeIds)
  }

  @Mutation(returns => ValidatedResponse, { description: 'Deauthorize a template for a site and all pagetrees within the site' })
  async deauthorizeTemplate (@Ctx() ctx: Context, @Arg('templateKey', type => ID) templateKey: string, @Arg('siteId', type => ID) siteId: string) {
    return await ctx.svc(TemplateService).deauthorizeTemplate(templateKey, siteId)
  }

  @Mutation(returns => ValidatedResponse)
  async setTemplateUniversal (@Ctx() ctx: Context, @Arg('templateId', type => ID) templateId: string, @Arg('universal') universal: boolean) {
    return await ctx.svc(TemplateService).setUniversal(templateId, universal)
  }
}

@Resolver(of => TemplatePermissions)
export class TemplatePermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'Authenticated user has permission to approve this template for use on a specific site.' })
  assign (@Ctx() ctx: Context, @Root() template: Template) {
    return ctx.svc(TemplateService).mayAssign(template)
  }

  @FieldResolver(returns => Boolean, { description: 'Authenticated user has permission to make this template universal or not.' })
  setUniversal (@Ctx() ctx: Context, @Root() template: Template) {
    return ctx.svc(TemplateService).maySetUniversal(template)
  }

  @FieldResolver(returns => Boolean, { description: 'Authenticated user has permission to use this template on the given page.' })
  async useOnPage (@Ctx() ctx: Context, @Root() template: Template, @Arg('pageId', type => ID) pageId: string) {
    const page = await ctx.svc(PageService).findById(pageId)
    if (!page) return false
    return await ctx.svc(TemplateService).mayUseOnPage(template, page)
  }
}

@Resolver(of => TemplateArea)
export class TemplateAreaResolver {
  @FieldResolver(returns => [Template], { description: 'Component templates that are possible inside this area. Does not take user/site permissions into account.' })
  async availableComponents (@Ctx() ctx: Context, @Root() templateArea: TemplateArea) {
    return await ctx.svc(TemplateService).findByKeys(templateArea.availableComponents)
  }
}
