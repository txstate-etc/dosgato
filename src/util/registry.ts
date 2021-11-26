import { TemplateArea } from '../template'
import { FulltextGatheringFn, LinkGatheringFn } from './indexing'
import { Migration } from './migrations'

export type TemplateType = 'page'|'component'|'data'

export interface Template {
  type: TemplateType

  /**
   * A unique string to globally identify this template across installations. Namespacing like
   * edu.txstate.RichTextEditor could be useful but no special format is required.
   */
  templateKey: string

  /**
   * Each template must declare its areas and the template keys of components that will be
   * permitted inside each area. The list of allowed component templates can be updated beyond
   * the list provided here. See templateRegistry.addAvailableComponent's comment for info on why.
   */
  areas: Record<string, TemplateArea>

  /**
   * Each template must provide a list of migrations for upgrading the data schema over time.
   * Typically this will start as an empty array and migrations will be added as the template
   * gets refactored.
   */
  migrations: Migration[]

  /**
   * Each template must provide a function that returns links from its data so that they
   * can be indexed. Only fields that are links need to be returned. Links inside rich editor
   * text will be extracted automatically from any text returned by getFulltext (see below)
   */
  getLinks: LinkGatheringFn

  /**
   * Each template must provide the text from any text or rich editor data it possesses, so that
   * the text can be decomposed into words and indexed for fulltext searches. Any text returned
   * by this function will also be scanned for links.
   */
  getFulltext: FulltextGatheringFn

  /**
   * Each template must provide a validation function so that the API can enforce its data is
   * shaped properly. If there are no issues, it should return an empty object {}, otherwise it
   * should return an object with keys that reference the path to the error and values that
   * are an array of error messages pertaining to that path.
   *
   * For instance, if name is required and the user didn't provide one, you would return:
   * { name: ['A name is required.'] }
   *
   * This method is async so that you can do things like look in the database for conflicting
   * names.
   */
  validate: (data: any) => Promise<Record<string, string[]>>
}

class TemplateRegistry {
  protected byType: Record<TemplateType, Template[]> = { page: [], component: [], data: [] }
  protected byKey: Record<string, Template> = {}
  register (template: Template) {
    this.byType[template.type] ??= []
    this.byType[template.type].push(template)
    this.byKey[template.templateKey] = template
  }

  /**
   * Use this function to extend a component after importing it. For instance,
   * if another developer writes a component for a carded layout, and you write a new
   * card that fits in that layout, you can add your custom card to its availableComponents
   * while constructing your individual CMS server.
   */
  addAvailableComponent (templateKey: string, area: string, availableComponent: string) {
    this.get(templateKey).areas[area]?.addAvailableComponent(availableComponent)
  }

  get (templateKey: string) {
    return this.byKey[templateKey]
  }

  getType (type: TemplateType) {
    return this.byType[type]
  }
}

export const templateRegistry = new TemplateRegistry()
