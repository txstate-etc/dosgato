import db from 'mysql2-async/db'
import { init } from './createdb'

export async function migrations () {
  await db.wait()
  const tables = await db.getvals('show tables')
  if (tables.length < 27) {
    await init()
  }
  if (!tables.includes('dbversion')) {
    await db.execute(`
      CREATE TABLE dbversion (
        id INT NOT NULL
      ) ENGINE InnoDB
    `)
    await db.insert('INSERT INTO version values (1)')
  }
}
