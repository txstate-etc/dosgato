import db from 'mysql2-async/db'
import { randomid } from 'txstate-utils'
import { Organization } from '../internal.js'

export async function getOrganizations (filter?: { ids?: string[], internalIds?: number[] }) {
  const binds: string[] = []
  const where: string[] = []
  if (filter) {
    if (filter.ids?.length) {
      where.push(`organizations.externalId IN (${db.in(binds, filter.ids)})`)
    }
    if (filter.internalIds?.length) {
      where.push(`organizations.id IN (${db.in(binds, filter.internalIds)})`)
    }
  }
  let query = 'SELECT * from organizations'
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  query += ' ORDER BY name'
  const orgs = await db.getall(query, binds)
  return orgs.map(org => new Organization(org))
}

export async function createOrganization (name: string, id?: string) {
  return await db.insert('INSERT INTO organizations (name, externalId) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), id=LAST_INSERT_ID(id)', [name, id ?? randomid(10)])
}
