import db from 'mysql2-async/db'
import { Site, SiteFilter } from './site.model'
import { isNotNull } from 'txstate-utils'

function processFilters (filter?: SiteFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (typeof filter !== 'undefined') {
    if (filter.ids?.length) {
      where.push(`sites.id IN (${db.in(binds, filter.ids)})`)
    }
    if (isNotNull(filter.launched)) {
      if (filter.launched) {
        where.push('sites.launchHost IS NOT NULL')
      } else {
        where.push('sites.launchHost IS NULL')
      }
    }
  }
  return { where, binds }
}

export async function getSites (filter?: SiteFilter) {
  const { binds, where } = processFilters(filter)
  const sites = await db.getall(`SELECT sites.id, sites.name, sites.url, sites.primaryPagetreeId, sites.rootAssetFolderId, sites.organizationId, sites.ownerId
                 FROM sites
                 WHERE (${where.join(') AND (')})`, binds)
  return sites.map(s => new Site(s))
}

export async function getSitesByOrganization (orgIds: string[]) {
  const binds: string[] = []
  const where: string[] = []

  where.push(`sites.organizationId IN (${db.in(binds, orgIds)})`)

  const sites = await db.getall(`SELECT sites.id, sites.name, sites.url, sites.primaryPagetreeId, sites.rootAssetFolderId, sites.organizationId, sites.ownerId
                                 FROM sites
                                 WHERE (${where.join(') AND (')})`, binds)
  return sites.map(s => new Site(s))
}