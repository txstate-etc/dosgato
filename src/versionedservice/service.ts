/* eslint-disable no-multi-str */
import { BaseService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import jsonPatch from 'fast-json-patch'
import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { createHash } from 'node:crypto'
import { clone, intersect } from 'txstate-utils'
import {
  type Index, type IndexJoinedStorage, type IndexStorage, type IndexStringified, NotFoundError,
  type SearchRule, type Tag, UpdateConflictError, type Versioned, type VersionedCommon,
  type VersionedStorage, type VersionStorage, type VersionFilter
} from '../internal.js'
import { DateTime } from 'luxon'
const { applyPatch, compare } = jsonPatch

const storageLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    const binds: any[] = []
    const rows = await db.getall<VersionedStorage>(`SELECT * FROM storage WHERE id IN (${db.in(binds, ids)})`, binds)
    return rows.map(r => ({ ...r, data: JSON.parse(r.data) }) as Versioned)
  }
})

const metaLoader = new ManyJoinedLoader({
  fetch: async (pairs: { id: number, version?: number }[]) => {
    const latests = pairs.filter(p => p.version == null)
    const versions = pairs.filter(p => p.version != null)
    const ret: { key: { id: number, version?: number }, value: VersionedCommon }[] = []
    await Promise.all([
      (async () => {
        if (latests.length) {
          const binds: string[] = []
          const latestrows = await db.getall<VersionedCommon>(`
            SELECT s.id, s.type, s.version, s.created, s.createdBy, s.modified, s.modifiedBy, s.comment, s.markedAt
            FROM storage s
            WHERE s.id IN (${db.in(binds, latests.map(p => p.id))})
          `, binds)
          ret.push(...latestrows.map(r => ({ key: { id: r.id }, value: r })))
        }
      })(),
      (async () => {
        if (versions.length) {
          const bindsL: (string | number)[] = []
          const bindsV: (string | number)[] = []
          const [latestrows, versionsrows] = await Promise.all([
            db.getall<VersionedCommon>(`
              SELECT s.id, s.type, s.version, s.created, s.createdBy, s.modified, s.modifiedBy, s.comment, s.markedAt
              FROM storage s
              WHERE (s.id, s.version) IN (${db.in(bindsL, versions.map(p => [p.id, p.version]))})`, bindsL),
            db.getall<VersionedCommon>(`
              SELECT v.id, s.type, v.version, s.created, s.createdBy, v.date as modified, v.user as modifiedBy, v.comment, v.markedAt
              FROM storage s INNER JOIN versions v ON v.id = s.id
              WHERE (v.id, v.version) IN (${db.in(bindsV, versions.map(p => [p.id, p.version]))})`, bindsV)
          ])
          ret.push(...latestrows.concat(versionsrows).map(r => ({
            key: { id: r.id, version: r.version },
            value: r
          })))
        }
      })()
    ])
    return ret
  }
})

const tagLoader = new PrimaryKeyLoader({
  fetch: async (keys: { id: number, tag: string }[]) => {
    const binds: string[] = []
    return await db.getall<Tag>(`SELECT * FROM tags WHERE (id, tag) IN (${db.in(binds, keys.map(k => [k.id, k.tag]))})`, binds)
  },
  extractId: tag => ({ id: tag.id, tag: tag.tag })
})

const currentTagsLoader = new OneToManyLoader({
  fetch: async (ids: number[]) => {
    const binds: string[] = []
    return await db.getall<Tag>(`SELECT t.* FROM tags t INNER JOIN storage s ON s.id=t.id AND s.version=t.version WHERE s.id IN (${db.in(binds, ids)})`, binds)
  },
  extractKey: tag => tag.id
})

const tagsLoader = new OneToManyLoader({
  fetch: async (pairs: { id: number, version: number }[]) => {
    const binds: string[] = []
    return await db.getall<Tag>(`SELECT t.* FROM tags t WHERE (t.id, t.version) IN (${db.in(binds, pairs.map(p => [p.id, p.version]))})`, binds)
  },
  extractKey: tag => ({ id: tag.id, version: tag.version })
})

const indexValueLoader = new ManyJoinedLoader({
  fetch: async (ids: number[], filters: { indexName: string, published?: boolean }) => {
    const binds: any[] = [filters.indexName]
    const rows = await db.getall<{ id: number, value: string }>(`
      SELECT DISTINCT s.id, iv.value
      FROM storage s
      ${filters.published
      ? `
        INNER JOIN tags t ON t.id=s.id AND t.tag='published'
        INNER JOIN indexes i ON i.id=s.id AND i.version=t.version
        `
      : `
        INNER JOIN indexes i ON i.id=s.id AND i.version=s.version
      `}
      INNER JOIN indexnames idxn ON idxn.id=i.name_id
      INNER JOIN indexvalues iv ON iv.id=i.value_id
      WHERE idxn.name=? AND s.id IN (${db.in(binds, ids)})
    `, binds)
    return rows.map(r => ({ key: r.id, value: r.value }))
  }
})

const versionsByNumberLoader = new OneToManyLoader({
  fetch: async (keys: { id: number, version: number, current: number }[]) => {
    const binds: (string | number)[] = []
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

function zerofill (n: number | string) {
  return typeof n === 'number' ? String(Math.floor(n)).padStart(12, '0') + (2.3 % 1).toFixed(4).substring(1) : n
}

function zerofillIndexes (indexes: Index[]) {
  let index: Index
  for (let i = 0; i < indexes.length; i++) {
    index = indexes[i]
    for (let j = 0; j < index.values.length; j++) {
      index.values[j] = zerofill(index.values[j])
    }
  }
  return indexes as IndexStringified[]
}

function createChecksum (v: string) {
  return createHash('sha1').update(v).digest('hex')
}

function sortChecksums (vals: (string | number)[]) {
  const filledvals = vals.map(zerofill)
  const checksums = filledvals.filter(v => v.length > 1024).map(createChecksum)
  const smallvals = filledvals.filter(v => v.length <= 1024)
  return [checksums, smallvals]
}

function unhexIn (binds: any[], hexvals: string[]) {
  binds.push(...hexvals)
  return hexvals.map(v => 'UNHEX(?)').join(',')
}

const indexNameIds: Record<string, number> = {}

export class VersionedService extends BaseService {
  protected static cleaningIndexValues: boolean
  protected static optimizingTables: boolean

  /**
   * Retrieve an object with a specific version or tag.
   *
   * This method is dataloaded so don't be afraid to make massively concurrent
   * requests for many objects.
   *
   * If you ask for a specific tag that doesn't exist, you'll receive undefined.
   */
  async get <DataType = any> (id: number, { version, tag }: { version?: number, tag?: string } = {}) {
    let versioned = await this.loaders.get(storageLoader).load(id)
    if (!versioned) return undefined
    if (tag && tag !== 'latest') {
      const verNum = (await this.loaders.get(tagLoader).load({ id, tag }))?.version
      if (typeof verNum === 'undefined') return undefined
      version = verNum
    }
    if (version && versioned.version !== version) {
      versioned = clone(versioned)
      const versionEntries = await this.loaders.get(versionsByNumberLoader).load({ id, version, current: versioned.version })
      for (const entry of versionEntries) {
        applyPatch(versioned.data, clone(entry.undo))
      }
      const lastEntry = versionEntries[versionEntries.length - 1]
      versioned.modified = lastEntry.date
      versioned.modifiedBy = lastEntry.user
      versioned.comment = lastEntry.comment
      versioned.version = lastEntry.version
      if (versioned.version !== version) return undefined
    }
    return versioned as Versioned<DataType>
  }

  async getMeta (id: number, opts?: { version?: number, tag?: string }) {
    let { tag, version } = opts ?? {}
    if (tag && tag !== 'latest') {
      const verNum = (await this.loaders.get(tagLoader).load({ id, tag }))?.version
      if (typeof verNum === 'undefined') return undefined
      version = verNum
    }
    return (await this.loaders.get(metaLoader).load({ id, version }))[0]
  }

  /**
   * Indexed search where all index values must be present on a specified tag (or default latest).
   */
  async findAll (indexes: { indexName: string, value: string }[], opts?: { tdb?: Queryable, tag?: string }) {
    if (indexes.length === 0) return []
    opts ??= {}
    opts.tdb ??= db
    opts.tag ??= 'latest'

    let where: string
    let join = ''
    const binds: any[] = []
    if (opts.tag === 'latest') {
      where = 's.version = i.version'
    } else {
      join = 'INNER JOIN tags t ON t.id=i.id AND t.version=i.version'
      where = 't.tag = ?'
      binds.push(opts.tag)
    }

    return await opts.tdb.getvals<string>(`
      SELECT s.id
      FROM storage s
      INNER JOIN indexes i ON i.id=s.id
      INNER JOIN indexnames n ON i.name_id=n.id
      INNER JOIN indexvalues v ON i.value_id=v.id
      ${join}
      WHERE ${where} AND (n.name, v.value) IN (${db.in(binds, indexes.map(idx => [idx.indexName, idx.value]))})
      GROUP BY s.id
      HAVING COUNT(*) = ${indexes.length}
    `, binds)
  }

  /**
   * Indexed search for objects.
   */
  async find (rules: SearchRule[], type?: string, tag = 'latest',
    /**
     * limit search to the given ids to reduce the search space when possible
     */
    ids?: string[],
    tdb: Queryable = db
  ) {
    const permbinds: string[] = []
    const permwhere: string[] = []
    const join: string[] = []
    if (tag === 'latest') {
      permwhere.push('s.version = i.version')
    } else {
      join.push('INNER JOIN tags t ON t.id=i.id AND t.version=i.version')
      permwhere.push('t.tag = ?')
      permbinds.push(tag)
    }

    if (type?.length) {
      permwhere.push('s.type = ?')
      permbinds.push(type)
    }

    if (ids?.length) {
      permwhere.push(`s.id IN (${db.in(permbinds, ids)})`)
    }

    const idsets = await Promise.all(rules.map(async rule => {
      const where = [...permwhere, 'n.name=?']
      const binds = [...permbinds, rule.indexName]

      if ('in' in rule) {
        const [checksums, smallvals] = sortChecksums(rule.in)
        const ors = []
        if (checksums.length) ors.push(`v.checksum IN (${unhexIn(binds, checksums)})`)
        if (smallvals.length) ors.push(`v.value IN (${db.in(binds, smallvals)})`)
        if (ors.length) where.push(ors.join(' OR '))
      } else if ('notIn' in rule) {
        const [checksums, smallvals] = sortChecksums(rule.notIn)
        if (checksums.length) where.push(`v.checksum NOT IN (${unhexIn(binds, checksums)})`)
        if (smallvals.length) where.push(`v.value NOT IN (${db.in(binds, smallvals)})`)
      } else if ('greaterThan' in rule) {
        where.push(`v.value >${rule.orEqual ? '=' : ''} ?`)
        binds.push(zerofill(rule.greaterThan))
      } else if ('lessThan' in rule) {
        where.push(`v.value <${rule.orEqual ? '=' : ''} ?`)
        binds.push(zerofill(rule.lessThan))
      } else if ('equal' in rule) {
        const val = zerofill(rule.equal)
        if (val.length > 1024) {
          where.push('v.checksum = UNHEX(?)')
          binds.push(createChecksum(val))
        } else {
          where.push('v.value = ?')
          binds.push(val)
        }
      } else if ('notEqual' in rule) {
        const val = zerofill(rule.notEqual)
        if (val.length > 1024) {
          where.push('v.checksum != UNHEX(?)')
          binds.push(createChecksum(val))
        } else {
          where.push('v.value != ?')
          binds.push(val)
        }
      } else if ('startsWith' in rule) {
        where.push('v.value LIKE ?')
        binds.push(zerofill(rule.startsWith) + '%')
      }

      return await tdb.getvals<string>(`
        SELECT DISTINCT CAST(s.id AS CHAR(50))
        FROM storage s
        INNER JOIN indexes i ON i.id=s.id
        INNER JOIN indexnames n ON i.name_id=n.id
        INNER JOIN indexvalues v ON i.value_id=v.id
        ${join.join('\n')}
        WHERE (${where.join(') AND (')})
      `, binds)
    }))

    return intersect(...idsets)
  }

  /**
   * See the indexes associated with a particular version
   *
   * Note that any numbers you passed in as indexes will have been stringified with
   * zerofill to 10 digits. This is to help normalize lexical vs numerical comparisons.
   */
  async getIndexes (id: number, version: number, tdb: Queryable = db) {
    const indexrows = await tdb.getall<IndexJoinedStorage>('SELECT i.*, v.value, n.name FROM indexes i INNER JOIN indexnames n ON i.name_id=n.id INNER JOIN indexvalues v ON v.id=i.value_id WHERE i.id=? AND i.version=? ORDER BY n.name, v.value', [id, version])
    const indexhash: Record<string, IndexStringified> = {}
    for (const row of indexrows) {
      indexhash[row.name] ??= { name: row.name, values: [] }
      indexhash[row.name].values.push(row.value)
    }
    return Object.values(indexhash)
  }

  async getCurrentIndexValues (id: number, idxName: string, published?: boolean) {
    return await this.loaders.get(indexValueLoader, { indexName: idxName, published }).load(id)
  }

  /**
   * Completely overwrite all the indexes for a specific version of an object.
   */
  async setIndexes (id: number, version: number, indexes: Index[], tdb?: Queryable) {
    if (tdb) {
      await this._setIndexes(id, version, indexes, tdb)
    } else {
      await db.transaction(async db => {
        // this method expects to already be in a transaction because it's shared by
        // create, update, and restore and they all do more work in the same transaction
        await this._setIndexes(id, version, indexes, db)
      })
    }
  }

  /**
   *  Only overwrite a single index type, leave the others alone.
   */
  async setIndex (id: number, version: number, index: Index) {
    const [sindex] = zerofillIndexes([index])
    await db.transaction(async db => {
      const existing = await db.getvals<string>(
        'SELECT v.value FROM indexes i INNER JOIN indexnames n ON i.name_id=n.id INNER JOIN indexvalues v ON v.id=i.value_id WHERE i.id=? AND i.version=? AND n.name=?',
        [id, version, sindex.name])
      const currentSet = new Set(existing)
      const nextSet = new Set(sindex.values)
      const eliminate = existing.filter(v => !nextSet.has(v))
      if (eliminate.length) {
        const deletebinds = [id, version, sindex.name]
        await db.delete(`
          DELETE i FROM indexes i
          INNER JOIN indexnames n ON i.name_id=n.id
          INNER JOIN indexvalues v ON v.id=i.value_id
          WHERE i.id=? AND i.version=? AND n.name=?
          AND v.value IN (${db.in(deletebinds, eliminate)})
        `, deletebinds)
      }
      const tobeadded = sindex.values.filter(v => !currentSet.has(v))
      const valuehash = await this.getIndexValueIds(tobeadded, db)
      const namehash = await this.getIndexNameIds([index.name], db)
      const indexEntries = tobeadded.map(value => [id, version, namehash[index.name], valuehash[value]])
      const binds: (string | number)[] = []
      await db.insert(`
        INSERT INTO indexes (id, version, name_id, value_id) VALUES ${db.in(binds, indexEntries)}
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
   *
   * @param tdb Optional transaction in which to perform creation.
   */
  async create (type: string, data: any, indexes: Index[], user?: string, tdb?: Queryable): Promise<number> {
    const action = async (db: Queryable) => {
      const id = await db.insert(`
        INSERT INTO storage (type, version, data, created, createdBy, modified, modifiedBy, comment)
        VALUES (?, 1, ?, NOW(), ?, NOW(), ?, '')
      `, [type, JSON.stringify(data), user ?? '', user ?? '', ''])
      await this._setIndexes(id, 1, indexes, db)
      return id
    }
    const id = tdb ? await action(tdb) : await db.transaction(action)
    return id
  }

  /**
   * Update the timestamps of a current record.
   *
   * When migrating content from another data source, it may be desirable to retain the created and modified
   * dates/users from the original system. During the migration process, you may use this method to override the created
   * and modified times of the current version.
   *
   * If you are migrating a version history, you should call this.update() once per version, and call this method
   * after each update to update the modifiedAt stamp. This way the corrected stamp will make its way into the
   * version history when you send your next update.
   */
  async setStamps (id: number, stamps: { createdAt?: Date, modifiedAt?: Date, modifiedBy?: string }, tdb?: Queryable) {
    if (!stamps.createdAt && !stamps.modifiedAt && !stamps.modifiedBy) return true
    const action = async (db: Queryable) => {
      const row = await db.getrow<{ modified: Date, modifiedBy: string, created: Date }>('SELECT created, modified, modifiedBy FROM storage WHERE id=?', [id])
      if (!row) throw new Error('Tried to update timestamps on a non-existing object.')
      const createdAt = stamps.createdAt ?? stamps.modifiedAt ?? row.created
      const modifiedAt = stamps.modifiedAt && stamps.modifiedAt >= createdAt
        ? stamps.modifiedAt
        : row.modified
      const modifiedBy = stamps.modifiedBy ?? row.modifiedBy
      await db.update('UPDATE storage SET created=?, modified=?, modifiedBy=? WHERE id=?', [createdAt, modifiedAt, modifiedBy, id])
    }
    if (tdb) await action(tdb)
    else await db.transaction(action)
    return true
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
  async update (id: number, data: any, indexes: Index[], { user, comment, version, date }: { user?: string, comment?: string, version?: number, date?: Date } = {}, tdb?: Queryable) {
    const action = async (db: Queryable) => {
      const current = await db.getrow<VersionedStorage>('SELECT * FROM storage WHERE id=?', [id])
      if (!current) throw new NotFoundError('Unable to find node with id: ' + String(id))
      if (typeof version !== 'undefined' && version !== current.version) throw new UpdateConflictError(id)
      const currentdata = JSON.parse(current.data)
      const newversion = current.version + 1
      const undo = compare(data, currentdata)
      if (undo.length) {
        await db.update(`
          UPDATE storage SET modified=?, version=?, data=?, modifiedBy=?, comment=?, markedAt=NULL WHERE id=?
        `, [date ?? new Date(), newversion, JSON.stringify(data), user ?? '', comment ?? '', current.id])
        await db.insert(`
          INSERT INTO versions (id, version, date, markedAt, user, comment, \`undo\`)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [current.id, current.version, current.modified, current.markedAt ?? null, current.modifiedBy, current.comment, JSON.stringify(undo)])
        await this._setIndexes(current.id, newversion, indexes, db)
      }
    }
    if (tdb) await action(tdb)
    else await db.transaction(action, { retries: 2 })
    this.loaders.get(storageLoader).clear(id)
  }

  /**
   * Restore a previous version of the object. Creates a new version. You could do
   * this with a .get and subsequent .update, but this is here for convenience.
   *
   * If you provide an indexes array, it will be used. Otherwise the indexes for the version
   * being restored will be restored as well.
   */
  async restore (id: number, { tag, version }: { tag?: string, version?: number }, { indexes, user, comment, tdb }: { indexes?: Index[], user?: string, comment?: string, tdb?: Queryable } = {}) {
    const toberestored = await this.get(id, { tag, version })
    if (!toberestored) throw new NotFoundError('Could not restore version for non-existing id: ' + String(id))
    indexes ??= await this.getIndexes(id, toberestored.version, tdb)
    await this.update(id, toberestored.data, indexes, { user, comment: comment ?? `Restored from ${DateTime.fromJSDate(toberestored.modified).toLocaleString(DateTime.DATETIME_SHORT)}.` }, tdb)
  }

  /**
   * Completely remove an object and its entire version history. Use with caution. May be
   * better to place a soft delete flag inside the object data.
   */
  async delete (id: number) {
    await db.transaction(async db => {
      await db.execute('DELETE FROM indexes WHERE id=?', [id])
      await db.execute('DELETE FROM tags WHERE id=?', [id])
      await db.execute('DELETE FROM versions WHERE id=?', [id])
      await db.execute('DELETE FROM storage WHERE id=?', [id])
    })
    VersionedService.cleanIndexValues().catch((e: Error) => { console.error(e) })
    this.loaders.get(storageLoader).clear(id)
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
  async tag (id: number, tag: string, version?: number, user?: string, date?: Date, tdb: Queryable = db) {
    version ??= await tdb.getval('SELECT version FROM storage WHERE id=?', [id])
    if (typeof version === 'undefined') throw new NotFoundError('Unable to tag non-existing object with id ' + String(id))
    if (tag === 'latest') throw new Error('Object versions may not be manually tagged as latest. That tag is managed automatically.')
    await tdb.insert('INSERT INTO tags (id, tag, version, date, user) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE version=VALUES(version), user=VALUES(user), date=VALUES(date)', [id, tag, version, date ?? new Date(), user ?? ''])
    this.loaders.get(tagLoader).clear({ id, tag })
  }

  /**
   * Get the version number, user, and date associated with a tag on a given object.
   *
   * This method is dataloaded so it is safe to call it many times concurrently.
   *
   * If the object does not have the given tag, returns undefined.
   */
  async getTag (id: number, tag: string) {
    return await this.loaders.get(tagLoader).load({ id, tag })
  }

  /**
   * Get a list of tags that apply to the given version
   *
   * Does not include 'latest'.
   */
  async getTags (id: number, version: number) {
    return await this.loaders.get(tagsLoader).load({ id, version })
  }

  /**
   * Get the set of tags that apply to the latest version of the given object, not
   * including 'latest'. For instance, if the latest version happens to be tagged as
   * 'published', then this will return [{ id, version, tag: 'published', user, date }]
   */
  async getCurrentTags (id: number) {
    return await this.loaders.get(currentTagsLoader).load(id)
  }

  /**
   * Remove a tag from an object, no matter which version it might be pointing at. Cannot be undone.
   */
  async removeTag (id: number, tag: string, tdb: Queryable = db) {
    await tdb.delete('DELETE FROM tags WHERE id=? AND tag=?', [id, tag])
    this.loaders.get(tagLoader).clear({ id, tag })
  }

  async removeTags (ids: number[], tags: string[], tdb: Queryable = db) {
    if (!ids?.length || !tags?.length) return true
    const binds: any[] = []
    await tdb.delete(`DELETE FROM tags WHERE tag IN (${db.in(binds, tags)}) AND id IN (${db.in(binds, ids)})`, binds)
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
    this.loaders.get(tagLoader).clearAll()
  }

  /**
   * List old versions of an object so one can be picked for retrieval.
   */
  async listVersions (id: number, filter?: VersionFilter) {
    let tagClause = '1=1'
    const binds: any[] = []
    if (filter?.tags?.length) {
      tagClause = `t.tag IN (${db.in(binds, filter.tags)})`
    }
    const versions = await db.getall<{ id: number, version: number, date: Date, user: string, comment: string, tags: string, markedAt?: Date, matches: number }>(`
      SELECT v.id, v.version, v.date, v.user, v.comment, GROUP_CONCAT(t.tag) AS tags, v.markedAt, COUNT(${tagClause}) AS matches
      FROM versions v LEFT JOIN tags t ON t.id=v.id AND t.version=v.version
      WHERE v.id=?
      GROUP BY v.id, v.version
      HAVING matches > 0
      ORDER BY v.id, v.version DESC
    `, [...binds, id])
    return versions.map(v => ({ ...v, tags: v.tags?.split(',') ?? [] }))
  }

  async toggleMarked (id: number, version: number) {
    await db.update('UPDATE storage SET markedAt=IF(markedAt IS NULL, NOW(), NULL) WHERE id=? AND version=?', [id, version])
    await db.update('UPDATE versions SET markedAt=IF(markedAt IS NULL, NOW(), NULL) WHERE id=? AND version=?', [id, version])
  }

  /**
   * internal method to map a set of index strings to their id in indexvalues table
   * inserts any values that do not already exist
   */
  protected async getIndexValueIds (values: string[], db: Queryable) {
    if (!values.length) return {} as Record<string, number>
    const checksumMap = new Map(values.map(v => [createChecksum(v), v]))
    await db.execute('SELECT * FROM dbversion FOR UPDATE')
    const insert: string[] = []
    const binds: any[] = []
    for (const [checksum, value] of checksumMap.entries()) {
      insert.push('(?,UNHEX(?))')
      binds.push(value.substring(0, 1024), checksum)
    }
    await db.insert(`INSERT INTO indexvalues (value, checksum) VALUES ${insert.join(',')} ON DUPLICATE KEY UPDATE value=value`, binds)
    const checksums = Array.from(checksumMap.keys())
    const valuerows = await db.getall<[number, string]>(`SELECT id, LOWER(HEX(checksum)) FROM indexvalues WHERE checksum IN (${checksums.map(v => 'UNHEX(?)').join(',')}) LOCK IN SHARE MODE`, checksums, { rowsAsArray: true })
    const valuehash: Record<string, number> = {}
    for (const [id, checksum] of valuerows) {
      if (checksumMap.has(checksum)) valuehash[checksumMap.get(checksum)!] = id
    }
    return valuehash
  }

  protected async getIndexNameIds (names: string[], db: Queryable) {
    if (names.some(n => indexNameIds[n] == null)) {
      const binds: any[] = []
      await db.insert(`INSERT INTO indexnames (name) VALUES ${db.in(binds, names.map(n => [n]))} ON DUPLICATE KEY UPDATE name=name`, binds)
      const rows = await db.getall<[number, string]>('SELECT * FROM indexnames LOCK IN SHARE MODE', undefined, { rowsAsArray: true })
      for (const [id, name] of rows) indexNameIds[name] = id
    }
    return indexNameIds
  }

  /**
   * internal method to replace all indexes for a given version of a versioned object
   * the public create, update, and setIndexes all share this common logic
   */
  protected async _setIndexes (id: number, version: number, indexes: Index[], db: Queryable) {
    const sindexes = zerofillIndexes(indexes)
    const values = sindexes.flatMap(ind => ind.values)
    const valuehash = await this.getIndexValueIds(values, db)
    const namehash = await this.getIndexNameIds(sindexes.map(ind => ind.name), db)
    const indexEntries = sindexes.flatMap(ind => ind.values.map(value => [id, version, namehash[ind.name], valuehash[value]]))
    const wanted = new Set(indexEntries.map(e => `${e[2]}.${e[3]}`))
    const currentEntries = await db.getall<Omit<IndexStorage, 'name'>>('SELECT * FROM indexes WHERE id=? AND version=?', [id, version])
    const eliminate = currentEntries
      .filter(e => !wanted.has(`${e.name_id}.${e.value_id}`))
      .map(e => [e.name_id, e.value_id])
    if (eliminate.length) {
      const deletebinds = [id, version]
      await db.execute(`DELETE FROM indexes WHERE id=? AND version=? AND (name_id, value_id) IN (${db.in(deletebinds, eliminate)})`, deletebinds)
    }
    const alreadyhave = new Set(currentEntries.map(r => `${r.name_id}.${r.value_id}`))
    const tobeadded = indexEntries.filter(e => !alreadyhave.has(`${e[2]}.${e[3]}`))
    if (tobeadded.length) {
      const binds: (string | number)[] = []
      await db.insert(`
        INSERT INTO indexes (id, version, name_id, value_id) VALUES ${db.in(binds, tobeadded)} ON DUPLICATE KEY UPDATE value_id=value_id
      `, binds)
    }
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
    })
    await this.cleanIndexValues()
    await this.optimize()
  }

  /**
   * internal method to defragment and optimize the database tables
   */
  protected static async optimize () {
    if (VersionedService.optimizingTables) return
    try {
      VersionedService.optimizingTables = true
      const tables = await db.getvals<string>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE data_free > 50*1024*1024 AND data_free / data_length > 0.25
        AND table_schema=DATABASE()
        AND table_name IN ('storage','versions','tags','indexes','indexvalues')
        order by data_free
      `)
      for (const table of tables) await db.execute(`OPTIMIZE TABLE ${table}`)
    } finally {
      VersionedService.optimizingTables = false
    }
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

  static async init (db: Queryable) {
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `storage` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `type` VARCHAR(255) NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `data` LONGTEXT CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_bin' NOT NULL, \
      `created` DATETIME NOT NULL, \
      `createdBy` VARCHAR(255) NOT NULL, \
      `modified` DATETIME NOT NULL, \
      `modifiedBy` VARCHAR(255) NOT NULL, \
      `comment` VARCHAR(255) NOT NULL, \
      PRIMARY KEY (`id`), \
      INDEX `type_modified` (`type`, `modified` DESC)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute("\
    CREATE TABLE IF NOT EXISTS `versions` ( \
      `id` INT UNSIGNED NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `date` DATETIME NOT NULL, \
      `user` VARCHAR(255) NOT NULL, \
      `comment` VARCHAR(255) NOT NULL, \
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
      `id` INT UNSIGNED NOT NULL, \
      `tag` VARCHAR(255) CHARACTER SET 'ascii' NOT NULL, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `user` VARCHAR(255) NOT NULL, \
      `date` DATETIME NOT NULL, \
      PRIMARY KEY (`id`, `tag`(255)), \
      CONSTRAINT `storage` \
        FOREIGN KEY (`id`) \
        REFERENCES `storage` (`id`) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci")
    await db.execute('\
    CREATE TABLE IF NOT EXISTS `indexvalues` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `value` VARCHAR(1024) NOT NULL, \
      `checksum` BINARY(20) NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE `checksum` (`checksum`), \
      INDEX `value` (`value`(100)) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci')
    await db.execute(`
    CREATE TABLE IF NOT EXISTS indexnames (
      id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE name_idx (name)
    )
    ENGINE = InnoDB
    DEFAULT CHARACTER SET = utf8mb4
    DEFAULT COLLATE = utf8mb4_general_ci`)
    await db.execute('\
    CREATE TABLE IF NOT EXISTS `indexes` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `version` MEDIUMINT UNSIGNED NOT NULL, \
      `name_id` SMALLINT UNSIGNED NOT NULL, \
      `value_id` INT UNSIGNED NOT NULL, \
      INDEX `value_idx` (`value_id` ASC), \
      INDEX `name_value` (`name_id` ASC, `value_id` ASC), \
      PRIMARY KEY (`id`, `version`, `name_id`, `value_id`), \
      CONSTRAINT `value` \
        FOREIGN KEY (`value_id`) \
        REFERENCES `indexvalues` (`id`), \
      CONSTRAINT `name_foreign` \
        FOREIGN KEY (`name_id`) \
        REFERENCES `indexnames` (`id`), \
      CONSTRAINT `value_foreign` \
        FOREIGN KEY (`id`) \
        REFERENCES `storage` (`id`) \
    ) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci')
  }
}
