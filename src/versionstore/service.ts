/* eslint-disable no-multi-str */
import { DataLoaderFactory, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { applyPatch, compare } from 'fast-json-patch'
import { Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import rfdc from 'rfdc'
import { intersectSorted, mapConcurrent } from 'txstate-utils'
import { Index, IndexStorage, NotFoundError, Tag, Versioned, VersionedStorage, VersionStorage } from './types'

const cloneDeep = rfdc()

const storageLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    const binds: string[] = []
    const rows = await db.getall<VersionedStorage>(`SELECT id, type, version, data FROM storage WHERE id IN ${db.in(binds, ids)}`, binds)
    return rows.map(r => ({ ...r, data: JSON.parse(r.data) }) as Versioned)
  }
})

const tagLoader = new PrimaryKeyLoader({
  fetch: async (keys: { id: string, tag: string }[]) => {
    const binds: string[] = []
    return await db.getall<Tag>(`SELECT id, version, tag FROM tags WHERE (id, tag) IN (${db.in(binds, keys.map(k => [k.id, k.tag]))})`, binds)
  },
  extractId: tag => ({ id: tag.id, tag: tag.tag })
})

const versionsByNumberLoader = new OneToManyLoader({
  fetch: async (keys: { id: string, version: number, current: number }[]) => {
    const binds: (string|number)[] = []
    const where = []
    for (const { id, version, current } of keys) {
      where.push('id=? AND version >= ? AND version < ?')
      binds.push(id, version, current)
    }
    const rows = await db.getall<VersionStorage>(`SELECT id, version, date, user, undo FROM versions WHERE (${where.join(') OR (')}) ORDER BY version DESC`, binds)
    return rows.map(r => ({ ...r, undo: JSON.parse(r.undo) }))
  },
  matchKey: ({ id, version }, entry) => entry.id === id && entry.version >= version,
  maxBatchSize: 50
})

export class VersionedService {
  protected factory = new DataLoaderFactory()
  protected static cleaningIndexValues: boolean

  async get (id: string, { version, tag }: { version?: number, tag?: string } = {}) {
    const data = await this.factory.get(storageLoader).load(id)
    if (!data) throw new NotFoundError()
    if (tag && tag !== 'latest') {
      const verNum = (await this.factory.get(tagLoader).load({ id, tag }))?.version
      if (typeof verNum === 'undefined') return undefined
      version = verNum
    }
    if (version && data.version !== version) {
      const versionEntries = await this.factory.get(versionsByNumberLoader).load({ id, version, current: data.version })
      for (const entry of versionEntries) {
        applyPatch(data, entry.undo)
      }
    }
    return data
  }

  async find (indexes: Index[], tag?: string) {
    let from = ''
    let where = ''
    if (tag?.length) {
      from = ' INNER JOIN tags t ON t.id=i.id AND t.version=i.version'
      where = ' AND t.tag=?'
    }
    const idsets = await mapConcurrent(indexes, 2, async index => {
      const binds: string[] = [index.name]
      if (tag?.length) binds.push(tag)
      return await db.getvals<string>(`SELECT DISTINCT i.id FROM indexes i INNER JOIN indexvalues v ON i.value_id=v.id${from} WHERE i.name=?${where} AND v.value IN (${db.in(binds, index.values)}) ORDER BY i.id`, binds)
    })
    return intersectSorted(idsets)
  }

  async setIndexes (id: string, version: number, indexes: Index[], tdb: Queryable = db) {
    const values = indexes.flatMap(ind => ind.values)
    await tdb.execute('DELETE FROM indexes WHERE id=? AND version=?', [id, version])
    const binds: (string|number)[] = []
    await tdb.insert(`INSERT INTO indexvalues (value) VALUES (${values.map(v => '?').join(',')}) ON DUPLICATE KEY UPDATE value=value`)
    const valuerows = await tdb.getall<[number, string]>(`SELECT id, value FROM indexvalues WHERE value IN (${values.map(v => '?').join(',')})`, values, { rowsAsArray: true })
    const valuehash: Record<string, number> = {}
    for (const [id, value] of valuerows) {
      valuehash[value] = id
    }
    const indexEntries = indexes.flatMap(ind => ind.values.map(value => [id, version, ind.name, valuehash[value]]))
    await tdb.insert(`
      INSERT INTO indexes (id, version, name, value_id) VALUES (${db.in(binds, indexEntries)})
    `, binds)
  }

  async create (type: string, data: any, indexes: Index[], user?: string): Promise<string> {
    const id = nanoid(10)
    try {
      await db.transaction(async db => {
        await db.insert(`
          INSERT INTO storage (id, type, version, data, created, createdBy, modified, modifiedBy, comment)
          VALUES (?, ?, 0, ?, NOW(), ?, NOW(), ?, '')
        `, [id, type, JSON.stringify(data), user ?? '', user ?? ''])
        await this.setIndexes(id, 0, indexes, db)
      })
      return id
    } catch (e) {
      if (e.errno === 1062) return await this.create(type, data, indexes, user)
      throw e
    }
  }

  async update (id: string, data: any, indexes: Index[], { user, comment }: { user?: string, comment?: string } = {}) {
    await db.transaction(async db => {
      const current = await db.getrow<VersionedStorage>('SELECT * FROM storage WHERE id=?', [id])
      if (!current) throw new NotFoundError('Unable to update node with non-existing id: ' + id)
      const newversion = current.version + 1
      const currentdata = JSON.parse(current.data)
      const undo = compare(data, currentdata)
      await db.update(`
        UPDATE storage SET modified=NOW(), version=?, data=?, user=?, comment=? WHERE id=?
      `, [newversion, JSON.stringify(data), user ?? '', comment ?? '', id])
      await db.insert(`
        INSERT INTO versions (id, version, date, user, comment, undo)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, current.version, current.modified, current.modifiedBy, current.comment, JSON.stringify(undo)])
      await this.setIndexes(id, newversion, indexes, db)
    })
    return true
  }

  async restore (id: string, version: number, { user, indexes, comment }: { user?: string, indexes?: Index[], comment?: string } = {}) {
    await db.transaction(async db => {
      const current = await db.getrow<VersionedStorage>('SELECT * FROM storage WHERE id=?', [id])
      if (!current) throw new NotFoundError('Unable to update node with non-existing id: ' + id)
      const newversion = current.version + 1
      const currentdata = JSON.parse(current.data)
      const versions = await db.getall<VersionStorage>('SELECT * FROM versions WHERE id=? AND version >= ?', [id, version])

      const updated = cloneDeep(currentdata)
      for (const version of versions) {
        const undo = JSON.parse(version.undo)
        applyPatch(updated, undo)
      }

      const undo = JSON.stringify(compare(updated, currentdata))
      await db.insert(`
        INSERT INTO versions (id, version, date, user, comment, undo)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, current.version, current.modified, current.modifiedBy, current.comment, undo])
      await db.update(`
        UPDATE storage SET modified=NOW(), version=?, data=?, user=?, comment=?
        WHERE id=?
      `, [newversion, JSON.stringify(updated), user ?? '', comment ?? `restored from earlier version (${version})`, id])

      if (!indexes) {
        const indexrows = await db.getall<IndexStorage>('SELECT i.*, v.value FROM indexes i INNER JOIN indexvalues v ON v.id=i.value_id WHERE i.id=? AND i.version=? ORDER BY i.name, v.value', [id, version])
        const indexhash: Record<string, Index> = {}
        for (const row of indexrows) {
          indexhash[row.name] ??= { name: row.name, values: [] }
          indexhash[row.name].values.push(row.value)
        }
        indexes = Object.values(indexhash)
      }
      await this.setIndexes(id, newversion, indexes, db)
    })
  }

  async delete (id: string) {
    await db.transaction(async db => {
      await db.execute('DELETE FROM storage WHERE id=?', [id])
      await db.execute('DELETE FROM versions WHERE id=?', [id])
      await db.execute('DELETE FROM tags WHERE id=?', [id])
      await db.execute('DELETE FROM indexes WHERE id=?', [id])
    })
    this.cleanIndexValues().catch((e: Error) => console.error(e))
  }

  async tag (id: string, tag: string, version: number) {
    await db.insert('INSERT INTO tags (id, tag, version) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE version=version', [id, tag, version])
  }

  protected async cleanIndexValues () {
    if (VersionedService.cleaningIndexValues) return
    try {
      VersionedService.cleaningIndexValues = true
      await db.execute('DELETE v FROM indexvalues v LEFT JOIN indexes i ON v.id=i.value_id WHERE i.value_id IS NULL')
    } finally {
      VersionedService.cleaningIndexValues = false
    }
  }

  static async init () {
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `storage` ( \
      `id` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `type` TINYTEXT NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `data` LONGTEXT CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_bin' NOT NULL, \
      `created` DATETIME NOT NULL, \
      `createdBy` TINYTEXT NOT NULL, \
      `modified` DATETIME NOT NULL, \
      `modifiedBy` TINYTEXT NOT NULL, \
      `comment` TINYTEXT NOT NULL, \
      PRIMARY KEY (`id`), \
      INDEX `type_modified` (`type` ASC, `modified` DESC)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `versions` ( \
      `id` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `date` DATETIME NOT NULL, \
      `user` TINYTEXT NOT NULL, \
      `comment` TINYTEXT NOT NULL, \
      `undo` LONGTEXT CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_bin' NOT NULL, \
      PRIMARY KEY (`id`, `version`), \
      INDEX `date` (`date` ASC), \
      CONSTRAINT `id` \
        FOREIGN KEY (`id`) \
        REFERENCES `storage` (`id`) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `tags` ( \
      `id` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `tag` TINYTEXT CHARACTER SET 'ascii' NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`, `tag`), \
      CONSTRAINT `storage` \
        FOREIGN KEY (`id`) \
        REFERENCES `storage` (`id`) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `indexes` ( \
      `id` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `name` TINYTEXT CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL, \
      `value_id` INT UNSIGNED NOT NULL, \
      INDEX `value_idx` (`value_id` ASC), \
      INDEX `name_value` (`name` ASC, `value_id` ASC), \
      PRIMARY KEY (`id`, `version`, `name`, `value_id`), \
      CONSTRAINT `value` \
        FOREIGN KEY (`value_id`) \
        REFERENCES `indexvalues` (`id`), \
      CONSTRAINT `id` \
        FOREIGN KEY (`id`) \
        REFERENCES `storage` (`id`) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute('\
    CREATE TABLE IF NOT EXISTS `indexvalues` ( \
      `id` INT UNSIGNED NOT NULL, \
      `value` TEXT NOT NULL, \
      PRIMARY KEY (`id`), \
      INDEX `value` (`value` ASC)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci')
  }
}

export const versionedService = new VersionedService()
