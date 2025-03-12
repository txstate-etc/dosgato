import db from 'mysql2-async/db'
import { type Queryable } from 'mysql2-async'
import { isNotNull, sortby } from 'txstate-utils'
import { init } from './createdb.js'
import { type DBMigration, VersionedService, getFullTextForIndexing, searchCodes, setAssetSearchCodes, setPageSearchCodes } from './internal.js'

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
  },
  {
    id: 20231130103000,
    description: 'add trainings table and users_trainings table',
    run: async db => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS trainings (
          id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(50) NOT NULL,
          PRIMARY KEY (id),
          UNIQUE name_idx (name)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users_trainings (
          userId MEDIUMINT UNSIGNED NOT NULL,
          trainingId SMALLINT UNSIGNED NOT NULL,
          recordedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (userId, trainingId),
          INDEX trainingId_idx (trainingId),
          CONSTRAINT FK_users_trainings_user FOREIGN KEY (userId) REFERENCES users (\`id\`),
          CONSTRAINT FK_users_trainings_training FOREIGN KEY (trainingId) REFERENCES trainings (\`id\`)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
      const basicId = await db.insert('INSERT INTO trainings (name) VALUES (?)', ['basic'])
      await db.insert('INSERT INTO users_trainings (userId, trainingId) SELECT u.id, ' + basicId + ' FROM users u WHERE u.trained = 1')
    }
  },
  {
    id: 20231130110000,
    description: 'remove user has been trained boolean from users table',
    run: async db => {
      await db.execute('ALTER TABLE users DROP COLUMN trained')
    }
  },
  {
    id: 20240110120000,
    description: 'record when a user was disabled by an automated process, so that an automated process can be permitted to re-enable',
    run: async db => {
      await db.execute('ALTER TABLE users ADD COLUMN disabledByAutomation TINYINT UNSIGNED NOT NULL DEFAULT 0')
    }
  },
  {
    id: 20240202091500,
    description: 'add indexing table for searching page names and titles',
    run: async db => {
      await db.execute(`
      CREATE TABLE IF NOT EXISTS searchcodes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        searchcode VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
        PRIMARY KEY (id),
        UNIQUE searchcode_idx (searchcode)
      )
      ENGINE = InnoDB
      DEFAULT CHARACTER SET = utf8mb4
      DEFAULT COLLATE = utf8mb4_general_ci
      `)
      await db.execute(`
      CREATE TABLE IF NOT EXISTS pages_searchcodes (
        pageId INT UNSIGNED NOT NULL,
        codeId INT UNSIGNED NOT NULL,
        PRIMARY KEY (pageId, codeId),
        INDEX code_idx (codeId),
        CONSTRAINT FK_pages_searchcodes_page FOREIGN KEY (pageId) REFERENCES pages (\`id\`),
        CONSTRAINT FK_pages_searchcodes_code FOREIGN KEY (codeId) REFERENCES searchcodes (\`id\`)
      )
      ENGINE = InnoDB
      DEFAULT CHARACTER SET = utf8mb4
      DEFAULT COLLATE = utf8mb4_general_ci
      `)
      const pages = await db.getall<{ internalId: number, name: string, title: string }>('SELECT id as internalId, name, title FROM pages')
      for (const p of pages) {
        await setPageSearchCodes(p, db)
      }
    }
  }, {
    id: 20240723102800,
    description: 'add page tagging',
    run: async db => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS pages_tags (
          pageId INT UNSIGNED NOT NULL,
          tagId CHAR(15) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL,
          PRIMARY KEY (pageId, tagId),
          INDEX tag_idx (tagId),
          CONSTRAINT FK_pages_tags_page FOREIGN KEY (pageId) REFERENCES pages (\`id\`)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
    }
  },
  {
    id: 20250304100000,
    description: 'add indexing tables for searching asset names and metadata',
    run: async db => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS assets_searchcodes (
          assetId INT UNSIGNED NOT NULL,
          codeId INT UNSIGNED NOT NULL,
          PRIMARY KEY (assetId, codeId),
          INDEX code_idx (codeId),
          CONSTRAINT FK_assets_searchcodes_asset FOREIGN KEY (assetId) REFERENCES assets (\`id\`),
          CONSTRAINT FK_assets_searchcodes_code FOREIGN KEY (codeId) REFERENCES searchcodes (\`id\`)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS assets_searchstrings (
          assetId INT UNSIGNED NOT NULL,
          term TEXT NOT NULL,
          PRIMARY KEY (assetId),
          CONSTRAINT FK_assets_searchstrings_asset FOREIGN KEY (assetId) REFERENCES assets (\`id\`)
        )
        ENGINE = InnoDB
        DEFAULT CHARACTER SET = utf8mb4
        DEFAULT COLLATE = utf8mb4_general_ci
      `)
      // make existing assets searchable
      const assets = await db.getall<{ internalId: number, name: string, data: string }>(`
        SELECT assets.id AS internalId, assets.name, storage.data
        FROM assets LEFT JOIN storage on assets.dataId = storage.id
      `)
      for (const asset of assets) {
        try {
          const data = JSON.parse(asset.data)
          const indexedFields = getFullTextForIndexing(data)
          await setAssetSearchCodes({ internalId: asset.internalId, name: asset.name, metaFields: indexedFields }, db)
        } catch {
          console.error(`Unable to add search codes for asset ${asset.internalId}`)
          continue
        }
      }
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

  await db.transaction(async db => {
    const usedIds = new Set(await db.getvals<number>('SELECT id FROM dbversion FOR UPDATE'))
    const allMigrations = sortby(dgMigrations.concat(moreMigrations ?? []), 'id')
    for (const migration of allMigrations) {
      if (usedIds.has(migration.id)) continue
      if (!usedIds.has(migration.id)) {
        console.info('Running migration', migration.id, ':', migration.description)
        await migration.run(db)
        await db.insert('INSERT INTO dbversion (id) VALUES (?)', [migration.id])
        console.info('Successfully migrated to', migration.id)
      }
    }
  })
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
      db.execute('DROP TABLE IF EXISTS users_trainings'),
      db.execute('DROP TABLE IF EXISTS trainings'),
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
      db.execute('DROP TABLE IF EXISTS storage'),
      db.execute('DROP TABLE IF EXISTS pages_searchcodes'),
      db.execute('DROP TABLE IF EXISTS assets_searchcodes'),
      db.execute('DROP TABLE IF EXISTS assets_searchstrings'),
      db.execute('DROP TABLE IF EXISTS searchcodes')
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
