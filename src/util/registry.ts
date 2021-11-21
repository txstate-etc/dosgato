import { FulltextGatheringFn, LinkGatheringFn } from './indexing'
import { Migration } from './migrations'

export type TemplateType = 'page'|'component'|'data'

export interface Template {
  type: TemplateType
  templateKey: string
  migrations: Migration[]
  getLinks: LinkGatheringFn
  getFulltext: FulltextGatheringFn
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

  get (templateKey: string) {
    return this.byKey[templateKey]
  }

  getType (type: TemplateType) {
    return this.byType[type]
  }
}

export const templateRegistry = new TemplateRegistry()
