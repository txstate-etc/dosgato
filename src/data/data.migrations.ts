import { type DataData } from '@dosgato/templating'
import { type Context } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
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
export async function migrateData (ctx: Context, data: DataData, dataRootId: string, dataFolderId?: string, dataId?: string, toSchemaVersion = templateRegistry.currentSchemaVersion) {
  let migrated = clone(data)
  const fromSchemaVersionMillis = DateTime.fromFormat(migrated.savedAtVersion, 'yLLddHHmmss').toMillis()
  const toSchemaVersionMillis = toSchemaVersion.toMillis()
  const backward = fromSchemaVersionMillis > toSchemaVersionMillis
  const tmpl = templateRegistry.getDataTemplate(migrated.templateKey)
  const migrations = (tmpl.migrations ?? [])
    .filter(m => backward
      ? m.createdAt.getTime() < fromSchemaVersionMillis && m.createdAt.getTime() > toSchemaVersionMillis
      : m.createdAt.getTime() > fromSchemaVersionMillis && m.createdAt.getTime() < toSchemaVersionMillis
    )
  const sortedMigrations = sortby(migrations, 'createdAt', backward)

  for (const migration of sortedMigrations) {
    const migrate = backward ? migration.down : migration.up
    migrated = await migrate(migrated, { query: ctx.query, dataRootId, dataFolderId, dataId })
  }
  migrated.savedAtVersion = toSchemaVersion.toFormat('yLLddHHmmss')
  return migrated
}
