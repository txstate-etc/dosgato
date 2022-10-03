import db from 'mysql2-async/db'
import { Queryable } from 'mysql2-async'
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
    id: 20220915000000,
    description: 'add unique index on (path,name) to pages table',
    run: async (db) => {
      await db.execute('ALTER TABLE `pages` MODIFY path varchar(255)')
      await db.execute('ALTER TABLE `pages` ADD CONSTRAINT nameinpath UNIQUE (`pagetreeId`,`path`, `name`)')
    }
  },
  {
    id: 20221002000000,
    description: 'expand primary key on resizes table in case two binaries resize to the same output (e.g. they started with different metadata or they are both black squares)',
    run: async (db) => {
      await db.execute('ALTER TABLE `resizes` DROP FOREIGN KEY FK_resizes_binaries_id')
      await db.execute('ALTER TABLE `resizes` DROP PRIMARY KEY')
      await db.execute('ALTER TABLE `resizes` ADD PRIMARY KEY (binaryId, originalBinaryId)')
      await db.execute('ALTER TABLE `resizes` ADD CONSTRAINT FK_resizes_binaries_id FOREIGN KEY (`binaryId`) REFERENCES `binaries` (`id`)')
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
  await db.transaction(async db => {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0')
    await Promise.all([
      db.execute('TRUNCATE TABLE downloads'),
      db.execute('TRUNCATE TABLE globalrules'),
      db.execute('TRUNCATE TABLE mutationlog'),
      db.execute('TRUNCATE TABLE datarules'),
      db.execute('TRUNCATE TABLE data'),
      db.execute('TRUNCATE TABLE pagetrees_templates'),
      db.execute('TRUNCATE TABLE assetrules'),
      db.execute('TRUNCATE TABLE pagerules'),
      db.execute('TRUNCATE TABLE sites_templates'),
      db.execute('TRUNCATE TABLE resizes'),
      db.execute('TRUNCATE TABLE users_roles'),
      db.execute('TRUNCATE TABLE groups_roles'),
      db.execute('TRUNCATE TABLE users_groups'),
      db.execute('TRUNCATE TABLE siterules'),
      db.execute('TRUNCATE TABLE groups_groups'),
      db.execute('TRUNCATE TABLE assets'),
      db.execute('TRUNCATE TABLE sites_managers'),
      db.execute('TRUNCATE TABLE templaterules'),
      db.execute('TRUNCATE TABLE datafolders'),
      db.execute('TRUNCATE TABLE binaries'),
      db.execute('TRUNCATE TABLE pages'),
      db.execute('TRUNCATE TABLE roles'),
      db.execute('TRUNCATE TABLE groups'),
      db.execute('TRUNCATE TABLE comments'),
      db.execute('TRUNCATE TABLE pagetrees'),
      db.execute('TRUNCATE TABLE assetfolders'),
      db.execute('TRUNCATE TABLE organizations'),
      db.execute('TRUNCATE TABLE indexes'),
      db.execute('TRUNCATE TABLE tags'),
      db.execute('TRUNCATE TABLE versions'),
      db.execute('TRUNCATE TABLE sites'),
      db.execute('TRUNCATE TABLE users'),
      db.execute('TRUNCATE TABLE indexvalues'),
      db.execute('TRUNCATE TABLE storage')
    ])
    await db.execute('SET FOREIGN_KEY_CHECKS = 1')
  })
}

export async function seeddb (tdb: Queryable = db) {
  const superuserRole = await tdb.insert('INSERT INTO roles (name) VALUES ("superuser")')
  await Promise.all([
    tdb.insert('INSERT INTO globalrules (roleId, manageAccess, manageParentRoles, createSites, manageGlobalData, viewSiteList, manageTemplates) VALUES (?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO siterules (roleId, launch, `rename`, governance, manageState, `delete`) VALUES (?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO assetrules (`roleId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO pagerules (`roleId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO datarules (`roleId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1]),
    tdb.insert('INSERT INTO templaterules (`roleId`, `use`) VALUES (?,?)', [superuserRole, 1])
  ])
}
