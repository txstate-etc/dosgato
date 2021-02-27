/* eslint-disable no-multi-str */
import { DataLoaderFactory, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { applyPatch, compare } from 'fast-json-patch'
import { Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { Index, IndexStorage, NotFoundError, Tag, UpdateConflictError, Version, Versioned, VersionedStorage, VersionStorage } from './types'

const storageLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    const binds: string[] = []
    const rows = await db.getall<VersionedStorage>(`SELECT * FROM storage WHERE id IN ${db.in(binds, ids)}`, binds)
    return rows.map(r => ({ ...r, data: JSON.parse(r.data) }) as Versioned)
  }
})

const tagLoader = new PrimaryKeyLoader({
  fetch: async (keys: { id: string, tag: string }[]) => {
    const binds: string[] = []
    return await db.getall<Tag>(`SELECT * FROM tags WHERE (id, tag) IN (${db.in(binds, keys.map(k => [k.id, k.tag]))})`, binds)
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
    const rows = await db.getall<VersionStorage>(`SELECT * FROM versions WHERE (${where.join(') OR (')}) ORDER BY version DESC`, binds)
    return rows.map(r => ({ ...r, undo: JSON.parse(r.undo) }))
  },
  matchKey: ({ id, version, current }, entry) => entry.id === id && entry.version >= version && entry.version < current,
  maxBatchSize: 50
})

export class VersionedService {
  protected factory = new DataLoaderFactory()
  protected static cleaningIndexValues: boolean

  /**
   * Retrieve an object with a specific version or tag.
   *
   * This method is dataloaded so don't be afraid to make massively concurrent
   * requests for many objects.
   *
   * If you ask for a specific tag that doesn't exist, you'll receive undefined.
   */
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

  /**
   * Indexed search for objects. Tag required, use 'latest' for current version.
   */
  async find (indexes: Index[], tag: string) {
    let tagfrom = ''
    let tagwhere = ''
    if (tag === 'latest') {
      tagfrom = 'INNER JOIN storage s ON s.id=i.id AND s.version=i.version'
    } else {
      tagfrom = ' INNER JOIN tags t ON t.id=i.id AND t.version=i.version'
      tagwhere = ' t.tag=? AND'
    }

    const binds = []
    const virtuals = []
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i]
      if (tagwhere?.length) binds.push(tag)
      virtuals.push(`
        INNER JOIN (
          SELECT DISTINCT i.id
          FROM indexes i
          INNER JOIN indexvalues v ON i.value_id=v.id
          ${tagfrom}
          WHERE
          ${tagwhere}
          i.name=? AND v.value IN (${db.in(binds, index.values)})
        ) r${i} ON r${i}.id=i.id
      `)
    }

    return await db.getvals<string>(`SELECT DISTINCT s.id FROM storage s ${virtuals.join('')}`, binds)
  }

  /**
   * See the indexes associated with a particular version
   */
  async getIndexes (id: string, version: number) {
    const indexrows = await db.getall<IndexStorage>('SELECT i.*, v.value FROM indexes i INNER JOIN indexvalues v ON v.id=i.value_id WHERE i.id=? AND i.version=? ORDER BY i.name, v.value', [id, version])
    const indexhash: Record<string, Index> = {}
    for (const row of indexrows) {
      indexhash[row.name] ??= { name: row.name, values: [] }
      indexhash[row.name].values.push(row.value)
    }
    return Object.values(indexhash)
  }

  /**
   * Completely overwrite all the indexes for a specific version of an object.
   */
  async setIndexes (id: string, version: number, indexes: Index[]) {
    await db.transaction(async db => {
      // this method expects to already be in a transaction because it's shared by
      // create, update, and restore and they all do more work in the same transaction
      await this._setIndexes(id, version, indexes, db)
    })
  }

  /**
   *  Only overwrite a single index type, leave the others alone.
   */
  async setIndex (id: string, version: number, index: Index) {
    await db.transaction(async db => {
      await db.execute('DELETE FROM indexes WHERE id=? AND version=? AND name=?', [id, version, index.name])
      const valuehash = await this.getIndexValueIds(index.values, db)
      const indexEntries = index.values.map(value => [id, version, index.name, valuehash[value]])
      const binds: (string|number)[] = []
      await db.insert(`
        INSERT INTO indexes (id, version, name, value_id) VALUES (${db.in(binds, indexEntries)})
      `, binds)
    })
  }

  /**
   * Create a new versioned object. Returns its auto-generated id (a 10 character string).
   *
   * You are expected to provide your own index strings; they will be stored and kept for
   * the entire version history.
   *
   * You may optionally provide a user who is responsible for the update.
   */
  async create (type: string, data: any, indexes: Index[], user?: string): Promise<string> {
    const id = nanoid(10)
    try {
      await db.transaction(async db => {
        await db.insert(`
          INSERT INTO storage (id, type, version, data, created, createdBy, modified, modifiedBy, comment)
          VALUES (?, ?, 1, ?, NOW(), ?, NOW(), ?, '')
        `, [id, type, JSON.stringify(data), user ?? '', user ?? ''])
        await this._setIndexes(id, 1, indexes, db)
      })
      return id
    } catch (e) {
      if (e.errno === 1062) return await this.create(type, data, indexes, user)
      throw e
    }
  }

  /**
   * Update an object, retaining the version history.
   *
   * You are expected to provide your own index strings; they will be stored and kept for
   * the entire version history.
   *
   * You may optionally provide a user who is responsible for the update and a comment string.
   *
   * You may also optionally provide the version that you had when you started the update for
   * an optimistic concurrency check.
   */
  async update (id: string, data: any, indexes: Index[], { user, comment, version }: { user?: string, comment?: string, version?: number } = {}) {
    await db.transaction(async db => {
      const current = await db.getrow<VersionedStorage>('SELECT * FROM storage WHERE id=?', [id])
      if (!current) throw new NotFoundError('Unable to find node with id: ' + id)
      if (typeof version !== 'undefined' && version !== current.version) throw new UpdateConflictError(id)
      const currentdata = JSON.parse(current.data)
      const newversion = current.version + 1
      const undo = compare(data, currentdata)
      await db.update(`
        UPDATE storage SET modified=NOW(), version=?, data=?, user=?, comment=? WHERE id=?
      `, [newversion, JSON.stringify(data), user ?? '', comment ?? '', current.id])
      await db.insert(`
        INSERT INTO versions (id, version, date, user, comment, undo)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [current.id, current.version, current.modified, current.modifiedBy, current.comment, JSON.stringify(undo)])
      await this._setIndexes(current.id, newversion, indexes, db)
    })
  }

  /**
   * Restore a previous version of the object. Creates a new version. You could do
   * this with a .get and subsequent .update, but this is here for convenience.
   *
   * If you provide an indexes array, it will be used. Otherwise the indexes for the version
   * being restored will be restored as well.
   */
  async restore (id: string, { tag, version }: { tag?: string, version?: number }, { indexes, user, comment }: { indexes?: Index[], user?: string, comment?: string } = {}) {
    const toberestored = await this.get(id, { tag, version })
    if (!toberestored) throw new NotFoundError('Could not restore version for non-existing id: ' + id)
    indexes ??= await this.getIndexes(id, toberestored.version)
    await this.update(id, toberestored.data, indexes, { user: user, comment: `restored from earlier version ${toberestored.version}${comment ? '\n' + comment : ''}` })
  }

  /**
   * Completely remove an object and its entire version history. Use with caution. May be
   * better to place a soft delete flag inside the object data.
   */
  async delete (id: string) {
    await db.transaction(async db => {
      await db.execute('DELETE FROM storage WHERE id=?', [id])
      await db.execute('DELETE FROM versions WHERE id=?', [id])
      await db.execute('DELETE FROM tags WHERE id=?', [id])
      await db.execute('DELETE FROM indexes WHERE id=?', [id])
    })
    VersionedService.cleanIndexValues().catch((e: Error) => console.error(e))
  }

  /**
   * Tag a specific version of an object. A tag can only point to one version at a time, so this
   * replaces an existing tag on another version. Cannot be undone.
   *
   * A common example will be tagging a version as 'published' or 'approved' as part of a workflow.
   *
   * 'latest' is reserved for the most current version of an object.
   *
   * @param version If undefined, tags latest version.
   * @param user Person responsible for applying the tag.
   */
  async tag (id: string, tag: string, version?: number, user?: string) {
    version ??= await db.getval('SELECT version FROM storage WHERE id=?', [id])
    if (typeof version === 'undefined') throw new NotFoundError('Unable to tag non-existing object with id ' + id)
    if (tag === 'latest') throw new Error('Object versions may not be manually tagged as latest. That tag is managed automatically.')
    await db.insert('INSERT INTO tags (id, tag, version, date, user) VALUES (?, ?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE version=VALUES(version), user=VALUES(user), date=VALUES(date)', [id, tag, version, user ?? ''])
  }

  /**
   * Get the version number, user, and date associated with a tag on a given object.
   *
   * This method is dataloaded so it is safe to call it many times concurrently.
   *
   * If the object does not have the given tag, returns undefined.
   */
  async getTag (id: string, tag: string) {
    return await this.factory.get(tagLoader).load({ id, tag })
  }

  /**
   * Remove a tag from an object, no matter which version it might be pointing at. Cannot be undone.
   */
  async removeTag (id: string, tag: string) {
    await db.execute('DELETE FROM tags WHERE id=? AND tag=?', [id, tag])
  }

  /**
   * Remove a tag from the system. Important to do this for obsolete tags so that versions
   * can be properly cleaned up. Any tag on a version will prevent it from being deleted by
   * retention policy.
   *
   * Use with caution, this cannot be undone.
   */
  async globalRemoveTag (tag: string) {
    await db.execute('DELETE FROM tags WHERE tag=?', [tag])
  }

  /**
   * List versions of an object so one can be picked for retrieval.
   */
  async listVersions (id: string) {
    const versions = await db.getall(`
      SELECT v.version, v.date, v.user, v.comment, t.tag
      FROM versions v LEFT JOIN tags t ON t.id=v.id AND t.version=v.version
    `)
    const versionhash: Record<number, Version> = {}
    for (const { version, date, user, comment, tag } of versions) {
      versionhash[version] ??= { id, version, date, user, comment, tags: [] }
      versionhash[version].tags.push(tag)
    }
    return Object.values(versionhash)
  }

  /**
   * internal method to map a set of index strings to their id in indexvalues table
   * inserts any values that do not already exist
   */
  protected async getIndexValueIds (values: string[], db: Queryable) {
    await db.insert(`INSERT INTO indexvalues (value) VALUES (${values.map(v => '?').join(',')}) ON DUPLICATE KEY UPDATE value=value`)
    const valuerows = await db.getall<[number, string]>(`SELECT id, value FROM indexvalues WHERE value IN (${values.map(v => '?').join(',')})`, values, { rowsAsArray: true })
    const valuehash: Record<string, number> = {}
    for (const [id, value] of valuerows) {
      valuehash[value] = id
    }
    return valuehash
  }

  /**
   * internal method to replace all indexes for a given version of a versioned object
   * the public create, update, and setIndexes all share this common logic
   */
  protected async _setIndexes (id: string, version: number, indexes: Index[], db: Queryable) {
    const values = indexes.flatMap(ind => ind.values)
    await db.execute('DELETE FROM indexes WHERE id=? AND version=?', [id, version])
    const valuehash = await this.getIndexValueIds(values, db)
    const indexEntries = indexes.flatMap(ind => ind.values.map(value => [id, version, ind.name, valuehash[value]]))
    const binds: (string|number)[] = []
    await db.insert(`
      INSERT INTO indexes (id, version, name, value_id) VALUES (${db.in(binds, indexEntries)})
    `, binds)
  }

  /**
   * Delete old versions in the system to implement a retention policy. Will not
   * delete any versions newer than the oldest active tag. For instance, if an object on
   * version 7 has a version 2 made many years ago but still tagged as 'published', version 2
   * and greater will be retained. Make sure any tags you use are managed carefully.
   */
  static async deleteOldVersions (olderThan: Date) {
    await db.transaction(async db => {
      // delete every version older than the date, except versions newer than the oldest tag
      // for instance, "published" is a planned tag, so we would not want a version to be wiped
      // out if it was still marked as published - we would have to hang on to it
      await db.execute(`
        DELETE v FROM versions v
        LEFT JOIN (
          SELECT t.id, MIN(t.version) as version
          FROM tags t
          INNER JOIN versions v ON v.id=t.id AND v.version=t.version
          WHERE v.date < ?
          GROUP BY t.id
        ) t ON t.id=v.id
        WHERE v.date < ? AND (t.version IS NULL OR v.version < t.version)
      `, [olderThan, olderThan])

      // delete (newly) orphaned indexes
      // this query is a bit slow as it requires a table scan of indexes but it
      // reliably cleans up orphans
      // it could be changed to clean up indexes specifically for the versions
      // identified above but then it's possible some orphaned indexes would accrue
      // in the system
      await db.execute(`
        DELETE i FROM indexes i
        LEFT JOIN versions v ON i.id=v.id AND i.version=v.version
        LEFT JOIN storage s ON i.id=s.id AND i.version=s.version
        WHERE v.id IS NULL AND s.id IS NULL
      `)
      await this.cleanIndexValues()
      await this.optimize()
    })
  }

  /**
   * internal method to defragment and optimize the database tables
   */
  protected static async optimize () {
    await db.execute('OPTIMIZE TABLES storage, versions, tags, indexes, indexvalues')
  }

  /**
   * internal method to clean out value strings from the indexvalues table when they are no longer
   * used
   */
  protected static async cleanIndexValues () {
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
      `user` TINYTEXT NOT NULL, \
      `date` DATETIME NOT NULL, \
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
