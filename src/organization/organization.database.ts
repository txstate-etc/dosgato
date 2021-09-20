import db from 'mysql2-async/db'
import { Organization } from './organization.model'

export async function getOrganizations () {
  const orgs = await db.getall('SELECT * from organizations')
  return orgs.map(org => new Organization(org))
}
