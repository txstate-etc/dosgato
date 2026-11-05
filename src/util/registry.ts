import type { APITemplateType, APIAnyTemplate, APIPageTemplate, APIComponentTemplate, APIDataTemplate, ComponentData, LinkDefinition, Migration } from '@dosgato/templating'
import { matchArea } from '@dosgato/templating'
import type { FastifyRequest } from 'fastify'
import { DateTime } from 'luxon'
import { sortby } from 'txstate-utils'
import { TemplateArea, parseLinks, type DGContextClass, type DGContext } from '../internal.js'
import type { DGStartOpts } from '../index.js'

interface HasHydratedAreas {
  getLinks: (data: any) => LinkDefinition[]
  hydratedAreas: Record<string, TemplateArea>
  hydratedDynamicAreas: Record<string, TemplateArea>
  disallowSet: Set<string>
}

type PageTemplate = Omit<APIPageTemplate, 'getLinks'> & HasHydratedAreas
type ComponentTemplate = Omit<APIComponentTemplate, 'getLinks'> & HasHydratedAreas
type DataTemplate = Omit<APIDataTemplate, 'getLinks'> & HasHydratedAreas
type AnyTemplate = PageTemplate | ComponentTemplate | DataTemplate
export type DGRestrictOperations = 'move' | 'delete' | 'rename' | 'changetemplate' | 'unpublish' | 'into'

class TemplateRegistry {
  protected byType: { page: PageTemplate[], component: ComponentTemplate[], data: DataTemplate[] } = { page: [], component: [], data: [] }
  protected byKey: Record<string, AnyTemplate> = {}
  protected migrations: (Migration<any, any> & { templateKey: string, isPage: boolean })[] = []
  public migrationsForward: (Migration<any, any> & { templateKey: string, isPage: boolean })[] = []
  public migrationsBackward: (Migration<any, any> & { templateKey: string, isPage: boolean })[] = []
  /**
   * The schema version this API stores data at. Derived from the newest migration registered
   * across all page, component and data templates, so it advances exactly when a migration is
   * added and can never fall behind a migration that exists in the build. Falls back to startup
   * time when no template defines a migration, in which case the value cannot matter.
   */
  public currentSchemaVersion = DateTime.local()
  public serverConfig!: Omit<DGStartOpts, 'templates'> & { customContext: DGContextClass }

  register (template: APIAnyTemplate) {
    const hydrated: AnyTemplate = { ...template, hydratedAreas: {}, hydratedDynamicAreas: {} } as AnyTemplate
    if ('areas' in template && template.areas != null) {
      for (const key of Object.keys(template.areas)) {
        hydrated.hydratedAreas[key] = new TemplateArea(key, template.areas[key])
      }
    }
    if ('dynamicAreas' in template && template.dynamicAreas != null) {
      for (const prefix of Object.keys(template.dynamicAreas)) {
        if (!prefix) throw new Error(`Refusing to start: template ${template.templateKey} declares an empty dynamic area prefix, which would match every area name.`)
        if (hydrated.hydratedAreas[prefix]) throw new Error(`Refusing to start: template ${template.templateKey} declares "${prefix}" as both an area and a dynamic area prefix.`)
        hydrated.hydratedDynamicAreas[prefix] = new TemplateArea(prefix, template.dynamicAreas[prefix])
      }
    }
    const originalGetLinks = template.getLinks ?? (() => [])
    hydrated.getLinks = (data: ComponentData) => parseLinks(originalGetLinks(data))
    if (template.type === 'page') hydrated.disallowSet = new Set(template.disallowComponents ?? [])
    this.byType[template.type].push(hydrated as any)
    this.byKey[template.templateKey] = hydrated
    this.migrations.push(...(template.migrations?.map(m => ({ ...m, templateKey: template.templateKey, isPage: template.type === 'page' })) ?? []))
  }

  sortMigrations () {
    // sortby sorts in place and returns its input, so each list needs its own copy or they
    // would be the same array and the forward list would end up in descending order
    this.migrationsForward = sortby([...this.migrations], 'createdAt')
    this.migrationsBackward = sortby([...this.migrations], 'createdAt', true)
    const now = Date.now()
    const future = this.migrationsForward.filter(m => m.createdAt.getTime() > now)
    if (future.length) {
      throw new Error('Refusing to start: migrations are dated in the future and would be skipped for data saved between now and then. '
        + future.map(m => `${m.templateKey} @ ${m.createdAt.toISOString()}`).join(', '))
    }
    const newest = this.migrationsForward[this.migrationsForward.length - 1]
    if (newest) this.currentSchemaVersion = DateTime.fromJSDate(newest.createdAt) as DateTime<true>
  }

  /**
   * Use this function to extend a component after importing it. For instance,
   * if another developer writes a component for a carded layout, and you write a new
   * card that fits in that layout, you can add your custom card to its availableComponents
   * while constructing your individual CMS server.
   */
  addAvailableComponent (templateKey: string, area: string, availableComponent: string) {
    const template = this.get(templateKey)
    const hydratedArea = template.hydratedAreas[area] ?? template.hydratedDynamicAreas[area]
    hydratedArea?.addAvailableComponent(availableComponent)
  }

  /**
   * Find the area configuration for an area name in a page or component template. An exact
   * static area name wins, then the longest matching dynamic area prefix. Returns undefined
   * when the template does not exist or does not declare the area.
   */
  getArea (templateKey: string, areaName: string): TemplateArea | undefined {
    const template = this.get(templateKey)
    if (!template) return undefined
    return matchArea(areaName, template.hydratedAreas, template.hydratedDynamicAreas)
  }

  get (templateKey: string) {
    return this.byKey[templateKey]
  }

  getDataTemplate (templateKey: string) {
    return this.get(templateKey) as DataTemplate
  }

  getPageTemplate (templateKey: string) {
    return this.get(templateKey) as PageTemplate
  }

  getComponentTemplate (templateKey: string) {
    return this.get(templateKey) as ComponentTemplate
  }

  getPageOrComponentTemplate (templateKey: string) {
    return this.get(templateKey) as PageTemplate | ComponentTemplate
  }

  getType (type: APITemplateType) {
    return this.byType[type]
  }

  async getCtx (req: FastifyRequest) {
    const ctx = new this.serverConfig.customContext(req) as DGContext
    await ctx.prefetch()
    return ctx
  }
}

export const templateRegistry = new TemplateRegistry()
