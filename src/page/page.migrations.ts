import { PageRecord, ComponentData, PageData, PageMigration, ComponentMigration } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { clone, sortby } from 'txstate-utils'
import { templateRegistry, collectTemplates } from '../internal.js'

// recursive helper function to traverse a page and apply one migration to any applicable
// components
async function processMigration (ctx: Context, page: PageRecord, path: string[], component: ComponentData, migration: (PageMigration|ComponentMigration) & { templateKey: string }, backward: boolean) {
  const migrate = backward ? migration.down : migration.up
  const newAreas: Record<string, Promise<ComponentData>[]> = {}

  for (const [areaKey, areaList] of Object.entries(component.areas ?? {})) {
    for (let i = 0; i < areaList.length; i++) {
      const cData = areaList[i]
      newAreas[areaKey].push(processMigration(ctx, page, [...path, 'areas', areaKey, String(i)], cData, migration, backward))
    }
  }
  for (const areaKey of Object.keys(component.areas ?? {})) {
    component.areas![areaKey] = await Promise.all(newAreas[areaKey])
  }
  if (migration.templateKey === component.templateKey) component = await migrate(component as any, ctx.query, page, path.join('.'))
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
export async function migratePage (ctx: Context, page: PageRecord, toSchemaVersion: Date = new Date()) {
  let data = clone(page.data)
  const templateKeysInUse = collectTemplates(data)
  const fromSchemaVersion = data.savedAtVersion
  const backward = fromSchemaVersion > toSchemaVersion
  // collect all the migrations from every component in the registry and filter out
  // the ones this page does not use or that are outside the time range in which we are
  // performing our transformation
  const migrations = Array.from(templateKeysInUse).map(k => templateRegistry.getPageOrComponentTemplate(k))
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

  for (const migration of sortedMigrations) data = await processMigration(ctx, page, [], data, migration, backward) as PageData
  data.savedAtVersion = toSchemaVersion
  page.data = data
  return page
}
