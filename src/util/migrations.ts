import { ComponentData } from './sharedtypes'

/**
 * In dosgato CMS, the data in the database is not altered except during user activity. This
 * means that older records could have been saved when the schema expected by component
 * rendering code was different than the date it's being rendered. To handle this, each
 * page and component template is required to provide migrations responsible for
 * transforming the data to the needed schema version.
 *
 * In order to support backwards compatibility, each API client will specify the date
 * when the code was written, so that their assumptions about the schema will be
 * frozen in time. This system means that migrations need to run backward as well as forward
 * in time.
 *
 * The `up` method is for changing data from an older schema to a newer one. The
 * `down` method is for changing data back from the newer schema to the older one.
 * If a `down` method cannot be provided, the migration is considered to be a breaking
 * change and anyone asking to rewind time to before the migration will receive an error.
 *
 * Your `up` and `down` methods will be applied to components in bottom-up fashion, so you
 * can assume that any components inside one of your areas has already been processed.
 */
export interface Migration {
  createdAt: Date
  up: (data: ComponentData) => ComponentData|Promise<ComponentData>
  down: (data: ComponentData) => ComponentData|Promise<ComponentData>
}

export interface MigrationWithTemplate extends Migration {
  templateKey: string
}
