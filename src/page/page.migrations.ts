import { sortby } from 'txstate-utils'
import { MigrationWithTemplate } from '../util/migrations'
import { templateRegistry } from '../util/registry'
import { ComponentData, PageData } from '../util/sharedtypes'
import { collectTemplates } from './page.util'

// recursive helper function to traverse a page and apply one migration to any applicable
// components
async function processMigration (component: ComponentData, migration: MigrationWithTemplate, backward: boolean) {
  const migrate = backward ? migration.down : migration.up
  const newAreas: Record<string, Promise<ComponentData>[]> = {}

  for (const [areaKey, areaList] of Object.entries(component.areas)) {
    for (const cData of areaList) {
      newAreas[areaKey].push(processMigration(cData, migration, backward))
    }
  }
  for (const areaKey of Object.keys(component.areas)) {
    component.areas[areaKey] = await Promise.all(newAreas[areaKey])
  }
  if (migration.templateKey === component.templateKey) component = await migrate(component)
  return component
}

/**
 * This function represents the entire process of migrating a page from one schema version
 * to another.
 *
 * Schema versions are represented as Dates so that components built by different authors
 * can be mixed and matched and have their migrations placed on a single timeline. It
 * could still get complicated if a third party component is not upgraded for some time and
 * the page component has done something to alter it in the mean time. That shouldn't pop up
 * often as usually the page's interest is in re-organizing components rather than
 * manipulating their internals.
 */
export async function migratePage (page: PageData, toSchemaVersion: Date = new Date()) {
  const templateKeysInUse = collectTemplates(page)
  const fromSchemaVersion = page.savedAtVersion
  const backward = fromSchemaVersion > toSchemaVersion
  // collect all the migrations from every component in the registry and filter out
  // the ones this page does not use or that are outside the time range in which we are
  // performing our transformation
  const migrations = Array.from(templateKeysInUse).map(k => templateRegistry.get(k))
    .flatMap(p => p.migrations.map(m => ({ ...m, templateKey: p.templateKey })))
    .filter(m => backward
      ? m.createdAt < fromSchemaVersion && m.createdAt > toSchemaVersion
      : m.createdAt > fromSchemaVersion && m.createdAt < toSchemaVersion
    )
  // now that we have a big list of migrations, we need to sort them by date to
  // make sure they go in order (e.g. if component A has a migration between the two
  // migrations specified by component B, we need to sort so we can run them in proper
  // order)
  const sortedMigrations = sortby(migrations, 'createdAt', backward)

  for (const migration of sortedMigrations) page = await processMigration(page, migration, backward) as PageData
  page.savedAtVersion = toSchemaVersion
  return page
}
