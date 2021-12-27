import db from 'mysql2-async/db'
import { Organization } from 'internal'

export async function getOrganizations (ids?: string[]) {
  const binds: string[] = []
  const where: string[] = []
  if (ids?.length) {
    where.push(`organizations.id IN (${db.in(binds, ids)})`)
  }
  let query = 'SELECT * from organizations'
  if (where.length) {
    query += `WHERE (${where.join(') AND (')})`
  }
  const orgs = await db.getall(query, binds)
  return orgs.map(org => new Organization(org))
}
