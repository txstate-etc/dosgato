import { Migration } from '@dosgato/templating'

export interface MigrationWithTemplate extends Migration {
  templateKey: string
}
