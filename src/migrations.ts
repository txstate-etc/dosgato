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
  },
  {
    id: 20221011000000,
    description: 'add deleteState column to pages table',
    run: async (db) => {
      await db.execute('ALTER TABLE `pages` ADD COLUMN deleteState TINYINT UNSIGNED NOT NULL DEFAULT 0')
    }
  },
  {
    id: 20221013000000,
    description: 'create new table for tracking scheduled tasks',
    run: async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          name VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL,
          lastBegin DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          inProgress TINYINT UNSIGNED NOT NULL DEFAULT 0,
          retries TINYINT UNSIGNED NOT NULL DEFAULT 0,
          PRIMARY KEY (name)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
    }
  },
  {
    id: 20221014000000,
    description: 'add deleteState column to data table',
    run: async (db) => {
      await db.execute('ALTER TABLE `data` ADD COLUMN deleteState TINYINT UNSIGNED NOT NULL DEFAULT 0')
    }
  },
  {
    id: 20221128000000,
    description: 'split users.name into firstname and lastname fields',
    run: async (db) => {
      await db.execute('ALTER TABLE `users` ADD COLUMN firstname VARCHAR(255) NOT NULL DEFAULT \'\', ADD COLUMN lastname VARCHAR(255) NOT NULL')
      await db.update('UPDATE users SET firstname = substring_index(name, \' \', 1), lastname = substring_index(name, \' \', -1) WHERE system=0')
      await db.update('UPDATE users SET firstname = "", lastname = name WHERE system=1')
      await db.execute('ALTER table `users` DROP COLUMN `name`')
    }
  },
  {
    id: 20221215000000,
    description: 'add deleteState column to assets and assetfolder tables',
    run: async (db) => {
      await db.execute('ALTER TABLE `assets` ADD COLUMN deleteState TINYINT UNSIGNED NOT NULL DEFAULT 0')
      await db.execute('UPDATE assets SET deleteState = 2 WHERE deletedAt IS NOT NULL')
      await db.execute('ALTER TABLE `assetfolders` ADD COLUMN deleteState TINYINT UNSIGNED NOT NULL DEFAULT 0')
      await db.execute('UPDATE assetfolders SET deleteState = 2 WHERE deletedAt IS NOT NULL')
    }
  },
  {
    id: 20230201120000,
    description: 'fix collation on assets.dataId since we use case-sensitive ids',
    run: async db => {
      await db.execute('ALTER TABLE `assets` MODIFY `dataId` CHAR(10) CHARACTER SET ascii COLLATE ascii_bin')
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
      db.execute('DROP TABLE IF EXISTS indexes'),
      db.execute('DROP TABLE IF EXISTS tags'),
      db.execute('DROP TABLE IF EXISTS versions'),
      db.execute('DROP TABLE IF EXISTS sites'),
      db.execute('DROP TABLE IF EXISTS users'),
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
    tdb.insert('INSERT INTO users (login, name, email, system, lastlogin, lastlogout, disabledAt) VALUES ("superuser", "System User", "", true, null, null, null)')
  ])
  await tdb.insert('INSERT INTO users_roles (userId, roleId) VALUES (?, ?)', [userId, superuserRole])
}
