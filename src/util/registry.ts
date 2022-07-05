import { APITemplateType, APITemplate } from '@dosgato/templating'
import { DateTime } from 'luxon'
import db from 'mysql2-async/db'
import { eachConcurrent, keyby } from 'txstate-utils'
import { TemplateArea } from '../internal.js'

interface APITemplateImpl extends Omit<APITemplate, 'areas'> {}
class APITemplateImpl implements Omit<APITemplate, 'areas'> {
  areas: Record<string, TemplateArea>
  constructor (template: APITemplate) {
    Object.assign(this, template)
    this.areas = {}
    for (const key of Object.keys(template.areas)) {
      this.areas[key] = new TemplateArea(key, template.areas[key])
    }
  }
}

class TemplateRegistry {
  protected byType: Record<APITemplateType, APITemplateImpl[]> = { page: [], component: [], data: [] }
  protected byKey: Record<string, APITemplateImpl> = {}
  public currentSchemaVersion!: DateTime

  register (template: APITemplate) {
    this.currentSchemaVersion = DateTime.fromMillis(Math.max(this.currentSchemaVersion?.toMillis() ?? 0, ...template.migrations.map(m => m.createdAt.getTime())))
    const impl = new APITemplateImpl(template)
    this.byType[template.type] ??= []
    this.byType[template.type].push(impl)
    this.byKey[template.templateKey] = impl
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

  getType (type: APITemplateType) {
    return this.byType[type]
  }
}

export const templateRegistry = new TemplateRegistry()

export async function syncRegistryWithDB () {
  const templatesInDB = keyby(await db.getall('SELECT * FROM templates'), 'key')
  const registryTemplates = [...templateRegistry.getType('page'), ...templateRegistry.getType('component'), ...templateRegistry.getType('data')]
  const found = new Set<string>()
  await eachConcurrent(registryTemplates, async (template) => {
    if (!templatesInDB[template.templateKey]) {
      console.log(`Adding template ${template.templateKey}`)
      await db.insert('INSERT INTO templates (`key`, `type`, `deleted`) VALUES (?,?,?)', [template.templateKey, template.type, 0])
    } else {
      found.add(template.templateKey)
    }
  })
  // TODO: This will set deleted = true for all templates in the database NOT added to the template registry.
  // Does anything need to happen with the datarules or datafolders associated with deleted templates?
  // Also need to consider the pagetrees_templates and sites_templates tables. What happens if an allowed template is deleted?
  const notInRegistry = Object.keys(templatesInDB).filter((t) => !found.has(t))
  if (notInRegistry.length > 0) {
    const deleteTemplateBinds: string[] = []
    const numDeleted = await db.update(`UPDATE templates SET deleted = true WHERE \`key\` IN (${db.in(deleteTemplateBinds, notInRegistry)})`, deleteTemplateBinds)
    if (numDeleted > 0) console.info(`${numDeleted} templates marked deleted because they were not found in template registry.`)
  }
}
