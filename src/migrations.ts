import db from 'mysql2-async/db'
import { type Queryable } from 'mysql2-async'
import { sortby } from 'txstate-utils'
import { init } from './createdb.js'
import { type DBMigration, VersionedService } from './internal.js'

const dgMigrations: DBMigration[] = [
  {
    id: 20220101000000,
    description: 'initialize all tables',
    run: async (db) => {
      await VersionedService.init(db)
      await init(db)
      await seeddb(db)
    }
  },
  {
    id: 20230430120000,
    description: 'allow versions to be "marked" by editors',
    run: async db => {
      await db.execute('ALTER TABLE versions ADD COLUMN markedAt DATETIME')
      await db.execute('ALTER TABLE storage ADD COLUMN markedAt DATETIME')
    }
  },
  {
    id: 20230508110000,
    description: 'index dataId on assets',
    run: async db => {
      await db.execute('CREATE UNIQUE INDEX `data_UNIQUE` ON `assets`(`dataId`)')
    }
  },
  {
    id: 20230620100000,
    description: 'index completed on requestedresizes',
    run: async db => {
      await db.execute('CREATE INDEX `completed_idx` ON `requestedresizes`(`completed`)')
    }
  },
  {
    id: 20230701053000,
    description: 'add global flag to datarules and index on binaries.mime',
    run: async db => {
      await db.execute('ALTER TABLE datarules ADD COLUMN isGlobal TINYINT UNSIGNED NOT NULL DEFAULT 0')
      await db.execute('CREATE INDEX `mime_idx` ON `binaries`(`mime`)')
    }
  }
]

export async function migrations (moreMigrations?: DBMigration[]) {
  await db.wait()
  const tables = await db.getvals('show tables')
  if (!tables.includes('dbversion')) {
    await db.execute(`
      CREATE TABLE dbversion (
        id BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE InnoDB
    `)
  }

  const usedIds = new Set(await db.getvals<number>('SELECT id FROM dbversion'))
  const allMigrations = sortby(dgMigrations.concat(moreMigrations ?? []), 'id')
  for (const migration of allMigrations) {
    if (usedIds.has(migration.id)) continue
    await db.transaction(async db => {
      if (!usedIds.has(migration.id)) {
        console.info('Running migration', migration.id, ':', migration.description)
        await migration.run(db)
        await db.insert('INSERT INTO dbversion (id) VALUES (?)', [migration.id])
        console.info('Successfully migrated to', migration.id)
      }
    })
  }
}

export async function resetdb () {
  console.info('resetting database')
  await db.transaction(async db => {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0')
    await Promise.all([
      db.execute('DROP TABLE IF EXISTS dbversion'),
      db.execute('DROP TABLE IF EXISTS downloads'),
      db.execute('DROP TABLE IF EXISTS globalrules'),
      db.execute('DROP TABLE IF EXISTS mutationlog'),
      db.execute('DROP TABLE IF EXISTS datarules'),
      db.execute('DROP TABLE IF EXISTS data'),
      db.execute('DROP TABLE IF EXISTS pagetrees_templates'),
      db.execute('DROP TABLE IF EXISTS assetrules'),
      db.execute('DROP TABLE IF EXISTS pagerules'),
      db.execute('DROP TABLE IF EXISTS sites_templates'),
      db.execute('DROP TABLE IF EXISTS resizes'),
      db.execute('DROP TABLE IF EXISTS requestedresizes'),
      db.execute('DROP TABLE IF EXISTS users_roles'),
      db.execute('DROP TABLE IF EXISTS groups_roles'),
      db.execute('DROP TABLE IF EXISTS users_groups'),
      db.execute('DROP TABLE IF EXISTS siterules'),
      db.execute('DROP TABLE IF EXISTS groups_groups'),
      db.execute('DROP TABLE IF EXISTS assets'),
      db.execute('DROP TABLE IF EXISTS sites_managers'),
      db.execute('DROP TABLE IF EXISTS templaterules'),
      db.execute('DROP TABLE IF EXISTS datafolders'),
      db.execute('DROP TABLE IF EXISTS binaries'),
      db.execute('DROP TABLE IF EXISTS pages'),
      db.execute('DROP TABLE IF EXISTS roles'),
      db.execute('DROP TABLE IF EXISTS groups'),
      db.execute('DROP TABLE IF EXISTS comments'),
      db.execute('DROP TABLE IF EXISTS pagetrees'),
      db.execute('DROP TABLE IF EXISTS assetfolders'),
      db.execute('DROP TABLE IF EXISTS organizations'),
      db.execute('DROP TABLE IF EXISTS templates'),
      db.execute('DROP TABLE IF EXISTS indexes'),
      db.execute('DROP TABLE IF EXISTS tags'),
      db.execute('DROP TABLE IF EXISTS versions'),
      db.execute('DROP TABLE IF EXISTS sites'),
      db.execute('DROP TABLE IF EXISTS users'),
      db.execute('DROP TABLE IF EXISTS indexnames'),
      db.execute('DROP TABLE IF EXISTS indexvalues'),
      db.execute('DROP TABLE IF EXISTS storage')
    ])
    await db.execute('SET FOREIGN_KEY_CHECKS = 1')
  })
}

export async function seeddb (tdb: Queryable = db) {
  const superuserRole = await tdb.insert('INSERT INTO roles (name) VALUES ("superuser")')
  const [,,,,,,userId] = await Promise.all([
    tdb.insert('INSERT INTO globalrules (roleId, manageAccess, manageParentRoles, createSites, manageGlobalData, viewSiteList, manageTemplates) VALUES (?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO siterules (roleId, launch, `rename`, governance, manageState, `delete`) VALUES (?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO assetrules (`roleId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO pagerules (`roleId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO datarules (`roleId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO templaterules (`roleId`, `use`) VALUES (?,?)', [superuserRole, 1]),
    tdb.insert('INSERT INTO users (login, firstname, lastname, email, system, lastlogin, lastlogout, disabledAt) VALUES ("system", "", "System User", "", true, null, null, null)')
  ])
  await tdb.insert('INSERT INTO users_roles (userId, roleId) VALUES (?, ?)', [userId, superuserRole])
}
