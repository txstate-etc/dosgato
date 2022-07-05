import { DataData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { clone, sortby } from 'txstate-utils'
import { templateRegistry } from '../internal.js'

/**
 * This function represents the process of migrating a piece from one schema version
 * to another.
 *
 * Schema versions are represented as Dates so that templates built by different authors
 * can be mixed and matched and have their migrations placed on a single timeline. It
 * could still get complicated if a third party template is not upgraded for some time and
 * the data entry has been migrated and saved in the time between the template's
 * migration date and bringing the update into the project. It may be necessary to manipulate
 * the template's migrations to alter the desired date to the date of the update.
 * Otherwise the template's migration would be skipped because it's too old.
 */
export async function migrateData (ctx: Context, data: DataData, datarootId: string, folderId?: string, dataId?: string, toSchemaVersion: Date = new Date()) {
  let migrated = clone(data)
  const fromSchemaVersion = migrated.savedAtVersion
  const backward = fromSchemaVersion > toSchemaVersion
  const tmpl = templateRegistry.getDataTemplate(data.templateKey)
  const migrations = tmpl.migrations
    .filter(m => backward
      ? m.createdAt < fromSchemaVersion && m.createdAt > toSchemaVersion
      : m.createdAt > fromSchemaVersion && m.createdAt < toSchemaVersion
    )
  const sortedMigrations = sortby(migrations, 'createdAt', backward)

  for (const migration of sortedMigrations) {
    const migrate = backward ? migration.down : migration.up
    migrated = await migrate(migrated, ctx.query, datarootId, folderId, dataId)
  }
  migrated.savedAtVersion = toSchemaVersion
  return migrated
}
