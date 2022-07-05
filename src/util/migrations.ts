import { Queryable } from 'mysql2-async'

export interface DBMigration {
  /**
   * number with format YYYYMMDDHHMMSS e.g. 20220101120000
   *
   * efficient storage and comparison but also easy to read & write
   */
  id: number
  description: string
  run: (db: Queryable) => Promise<void>
}
