import db from 'mysql2-async/db'
import { randomid } from 'txstate-utils'
import { Organization, type OrganizationFilter } from '../internal.js'

export async function getOrganizations (filter?: OrganizationFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter) {
    if (filter.externalIds?.length) {
      where.push(`organizations.externalId IN (${db.in(binds, filter.externalIds)})`)
    }
    if (filter.ids?.length) {
      where.push(`organizations.id IN (${db.in(binds, filter.ids)})`)
    }
    if (filter.search?.length) {
      const search = filter.search.trim()
      where.push('organizations.name LIKE ? OR organizations.externalId=?', '%' + search + '%', search)
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

export async function createOrganization (name: string, externalId?: string) {
  return await db.insert('INSERT INTO organizations (name, externalId) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), id=LAST_INSERT_ID(id)', [name, externalId ?? randomid(10)])
}
