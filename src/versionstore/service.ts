import { DataLoaderFactory, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { applyPatch, compare } from 'fast-json-patch'
import { Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { Index, NotFoundError, Tag, Versioned, VersionedStorage, VersionStorage } from './types'

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

  async setIndexes (id: string, version: number, indexes: Index[], tdb: Queryable = db) {
    const indexEntries = indexes.flatMap(ind => ind.values.map(value => [id, version, ind.name, value]))
    const binds: (string|number)[] = []
    await tdb.execute('DELETE FROM indexes WHERE id=? AND version=?', [id, version])
    await tdb.insert(`
      INSERT INTO indexes (id, version, name, value) VALUES (${db.in(binds, indexEntries)})
    `, binds)
  }

  async create (type: string, data: any, indexes: Index[], user?: string): Promise<string> {
    const id = Math.random().toString(36).slice(2, 12)
    try {
      await db.transaction(async db => {
        await db.insert(`
          INSERT INTO storage (id, type, version, data, created, createdBy, modified, modifiedBy)
          VALUES (?, ?, 0, ?, NOW(), ?, NOW(), ?)
        `, [id, type, JSON.stringify(data), user ?? '', user ?? ''])
        await this.setIndexes(id, 0, indexes, db)
      })
      return id
    } catch (e) {
      if (e.errno === 1062) return await this.create(type, data, indexes)
      throw e
    }
  }

  async update (id: string, data: any, indexes: Index[], user?: string) {
    await db.transaction(async db => {
      const current = await db.getrow<VersionedStorage>('SELECT * FROM storage WHERE id=?', [id])
      if (!current) throw new NotFoundError('Unable to update node with non-existing id: ' + id)
      const newversion = current.version + 1
      const undo = compare(data, current.data)
      await db.execute(`
        UPDATE storage SET modified=NOW(), version=?, data=?, user=? WHERE id=?
      `, [newversion, JSON.stringify(data), user ?? '', id])
      await db.insert(`
        INSERT INTO versions (id, version, date, user, undo)
        VALUES (?, ?, ?, ?, ?)
      `, [id, current.version, current.modified, current.modifiedBy, JSON.stringify(undo)])
      await this.setIndexes(id, newversion, indexes, db)
    })
    return true
  }

  async delete (id: string) {
    await db.transaction(async db => {
      await db.execute('DELETE FROM storage WHERE id=?', [id])
      await db.execute('DELETE FROM versions WHERE id=?', [id])
      await db.execute('DELETE FROM tags WHERE id=?', [id])
      await db.execute('DELETE FROM indexes WHERE id=?', [id])
    })
  }

  async tag (id: string, tag: string, version: number) {
    await db.insert('INSERT INTO tags (id, tag, version) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE', [id, tag, version])
  }
}

export const versionedService = new VersionedService()
