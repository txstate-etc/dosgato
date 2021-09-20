import db from 'mysql2-async/db'
import { Organization } from './organization.model'

export async function getOrganizations (ids?: string[]) {
  const binds: string[] = []
  const where: string[] = []
  if (ids?.length) {
    where.push(`organizations.id IN (${db.in(binds, ids)})`)
  }
  const orgs = await db.getall(`SELECT * from organizations
                                WHERE (${where.join(') AND (')})`, binds)
  return orgs.map(org => new Organization(org))
}
