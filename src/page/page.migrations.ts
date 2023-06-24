import { type ComponentData, type PageData, type PageMigration, type ComponentMigration, type PageExtras, type ComponentExtras } from '@dosgato/templating'
import { DateTime } from 'luxon'
import { clone } from 'txstate-utils'
import { templateRegistry } from '../internal.js'

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
    if (newAreas[areaKey] != null) component.areas![areaKey] = await Promise.all(newAreas[areaKey])
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
  const fromSchemaVersionMillis = DateTime.fromFormat(data.savedAtVersion, 'yLLddHHmmss', { zone: 'UTC' }).toMillis()
  const toSchemaVersionMillis = toSchemaVersion.toMillis()
  const backward = fromSchemaVersionMillis > toSchemaVersionMillis

  const migrations = backward
    ? templateRegistry.migrationsBackward.filter(m => m.createdAt.getTime() < fromSchemaVersionMillis && m.createdAt.getTime() >= toSchemaVersionMillis)
    : templateRegistry.migrationsForward.filter(m => m.createdAt.getTime() > fromSchemaVersionMillis && m.createdAt.getTime() <= toSchemaVersionMillis)

  for (const migration of migrations) {
    const migrate = backward ? migration.down : migration.up
    if (migration.templateKey === data.templateKey) data = await (migrate as PageMigration['up'])(data, extras)
    else if (!migration.isPage) data = await processMigration(migration.templateKey, migrate as ComponentMigrationFn, data, [], { ...extras, page: data, path: '' }) as PageData
  }
  data.savedAtVersion = toSchemaVersion.toUTC().toFormat('yLLddHHmmss')
  return data
}
