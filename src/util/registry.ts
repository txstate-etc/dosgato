import { APITemplateType, APIAnyTemplate, APIPageTemplate, APIComponentTemplate, APIDataTemplate } from '@dosgato/templating'
import { DateTime } from 'luxon'
import { TemplateArea } from '../internal.js'

interface HasHydratedAreas {
  hydratedAreas: Record<string, TemplateArea>
}

type PageTemplate = APIPageTemplate & HasHydratedAreas
type ComponentTemplate = APIComponentTemplate & HasHydratedAreas
type DataTemplate = APIDataTemplate & HasHydratedAreas
type AnyTemplate = PageTemplate|ComponentTemplate|DataTemplate

class TemplateRegistry {
  protected byType: { page: PageTemplate[], component: ComponentTemplate[], data: DataTemplate[] } = { page: [], component: [], data: [] }
  protected byKey: Record<string, AnyTemplate> = {}
  public currentSchemaVersion!: DateTime

  register (template: APIAnyTemplate) {
    this.currentSchemaVersion = DateTime.fromMillis(Math.max(this.currentSchemaVersion?.toMillis() ?? 0, ...template.migrations.map(m => m.createdAt.getTime())))
    const hydrated: AnyTemplate = { ...template, hydratedAreas: {} }
    if ('areas' in template && template.areas != null) {
      for (const key of Object.keys(template.areas)) {
        hydrated.hydratedAreas[key] = new TemplateArea(key, template.areas[key])
      }
    }
    this.byType[template.type].push(hydrated as any)
    this.byKey[template.templateKey] = hydrated
  }

  /**
   * Use this function to extend a component after importing it. For instance,
   * if another developer writes a component for a carded layout, and you write a new
   * card that fits in that layout, you can add your custom card to its availableComponents
   * while constructing your individual CMS server.
   */
  addAvailableComponent (templateKey: string, area: string, availableComponent: string) {
    this.get(templateKey).hydratedAreas[area]?.addAvailableComponent(availableComponent)
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
    return this.get(templateKey) as PageTemplate|ComponentTemplate
  }

  getType (type: APITemplateType) {
    return this.byType[type]
  }
}

export const templateRegistry = new TemplateRegistry()
