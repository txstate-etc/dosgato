import { ComponentData, PageData, PageMigration, ComponentMigration, PageExtras, ComponentExtras } from '@dosgato/templating'
import { DateTime } from 'luxon'
import { clone, isNotNull, sortby } from 'txstate-utils'
import { templateRegistry, collectTemplates } from '../internal.js'

type ComponentMigrationFn = ComponentMigration['up']

// recursive helper function to traverse a page and apply one migration to any applicable
// components
async function processMigration (templateKey: string, migrate: ComponentMigrationFn, component: ComponentData, path: string[], extras: ComponentExtras) {
  const newAreas: Record<string, Promise<ComponentData>[]> = {}

  for (const [areaKey, areaList] of Object.entries(component.areas ?? {})) {
    for (let i = 0; i < areaList.length; i++) {
      const cData = areaList[i]
      const subpath = [...path, 'areas', areaKey, String(i)]
      newAreas[areaKey] ??= []
      newAreas[areaKey].push(processMigration(templateKey, migrate, cData, subpath, { ...extras, path: subpath.join('.') }))
    }
  }
  for (const areaKey of Object.keys(component.areas ?? {})) {
    component.areas![areaKey] = await Promise.all(newAreas[areaKey])
  }
  if (templateKey === component.templateKey) component = await migrate(component, extras)
  return component
}

/**
 * This function represents the entire process of migrating a page from one schema version
 * to another.
 *
 * Schema versions are represented as Dates so that components built by different authors
 * can be mixed and matched and have their migrations placed on a single timeline. It
 * could still get complicated if a third party component is not upgraded for some time and
 * the page has been migrated and saved in the time between the third party component's
 * migration date and bringing the update into the project. It may be necessary to manipulate
 * the third party component's migrations to alter the desired date to the date of the update.
 * Otherwise the third party component's migration would be skipped because it's too old.
 */
export async function migratePage (page: PageData, extras: PageExtras, toSchemaVersion = templateRegistry.currentSchemaVersion) {
  let data = clone(page)
  const [pageTemplateKey, ...templateKeysInUse] = collectTemplates(data)
  const fromSchemaVersionMillis = DateTime.fromFormat(data.savedAtVersion, 'yLLddHHmmss').toMillis()
  const toSchemaVersionMillis = toSchemaVersion.toMillis()
  const backward = fromSchemaVersionMillis > toSchemaVersionMillis
  // collect all the migrations from every component in the registry and filter out
  // the ones this page does not use or that are outside the time range in which we are
  // performing our transformation
  const migrations = Array.from(templateKeysInUse).map(k => templateRegistry.getPageOrComponentTemplate(k))
    .filter(isNotNull)
    // if the page happens to have super bad data where a page template key is on a component, filter it out
    .filter(p => p.type === 'component')
    // then add back the page template
    .concat([templateRegistry.getPageTemplate(pageTemplateKey)])
    .flatMap(p => (p.migrations ?? []).map(m => ({ ...m, templateKey: p.templateKey, isPage: p.type === 'page' })))
    .filter(m => backward
      ? m.createdAt.getTime() < fromSchemaVersionMillis && m.createdAt.getTime() >= toSchemaVersionMillis
      : m.createdAt.getTime() > fromSchemaVersionMillis && m.createdAt.getTime() <= toSchemaVersionMillis
    )
  // now that we have a big list of migrations, we need to sort them by date to
  // make sure they go in order (e.g. if component A has a migration between the two
  // migrations specified by component B, we need to sort so we can run them in proper
  // order)
  const sortedMigrations = sortby(migrations, 'createdAt', backward)

  for (const migration of sortedMigrations) {
    const migrate = backward ? migration.down : migration.up
    if (migration.isPage) data = await (migrate as PageMigration['up'])(data, extras)
    else data = await processMigration(migration.templateKey, migrate as ComponentMigrationFn, data, [], { ...extras, page: data, path: '' }) as PageData
  }
  data.savedAtVersion = toSchemaVersion.toFormat('yLLddHHmmss')
  return data
}
