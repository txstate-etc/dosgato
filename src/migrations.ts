import db from 'mysql2-async/db'
import { init } from './createdb'
import { VersionedService } from 'internal'
import { fixtures } from './fixtures'

export async function migrations () {
  await db.wait()
  const tables = await db.getvals('show tables')
  if (tables.length < 33) {
    await VersionedService.init()
    await init()
  }
  if (!tables.includes('dbversion')) {
    await db.execute(`
      CREATE TABLE dbversion (
        id INT NOT NULL
      ) ENGINE InnoDB
    `)
    await db.insert('INSERT INTO dbversion values (1)')
  }
  if (process.env.RESET_DB_ON_STARTUP === 'true') {
    await fixtures()
  }
}
