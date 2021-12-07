import db from 'mysql2-async/db'
import { Site, SiteFilter } from './site.model'
import { isNotNull, unique } from 'txstate-utils'

const columns: string[] = ['sites.id', 'sites.name', 'sites.launchHost', 'sites.primaryPagetreeId', 'sites.rootAssetFolderId', 'sites.organizationId', 'sites.ownerId']

function processFilters (filter?: SiteFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`sites.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.launched != null) {
    if (filter.launched) {
      where.push('sites.launchHost IS NOT NULL')
    } else {
      where.push('sites.launchHost IS NULL')
    }
  }
  if (filter?.assetRootIds?.length) {
    where.push(`sites.rootAssetFolderId IN ${db.in(binds, filter.assetRootIds)}`)
  }
  return { where, binds }
}

export async function getSites (filter?: SiteFilter) {
  const { binds, where } = processFilters(filter)
  let query = `SELECT ${columns.join(', ')} FROM sites`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  const sites = await db.getall(query, binds)
  return sites.map(s => new Site(s))
}

export async function getSitesByOrganization (orgIds: string[]) {
  const binds: string[] = []
  const where: string[] = []

  where.push(`sites.organizationId IN (${db.in(binds, orgIds)})`)

  const sites = await db.getall(`SELECT ${columns.join(', ')} FROM sites
                                 WHERE (${where.join(') AND (')})`, binds)
  return sites.map(s => new Site(s))
}

export async function getSitesByTemplate (templateIds: number[], atLeastOneTree?: boolean) {
  const binds: string[] = []

  const wholeSites = await db.getall(`SELECT ${columns.join(', ')}, sites_templates.templateId as templateId FROM sites
                                 INNER JOIN sites_templates ON sites.id = sites_templates.siteId
                                 WHERE sites_templates.templateId IN (${db.in(binds, templateIds)})`, binds)
  if (!atLeastOneTree) {
    return wholeSites.map(s => ({ key: s.templateId, value: new Site(s) }))
  } else {
    // also return any sites where one or more pagetrees are able to use the template
    const binds2: string[] = []
    const sitesWithPagetreesWithTemplate = await db.getall(`SELECT ${columns.join(', ')}, pagetrees_templates.templateId as templateId FROM sites
                                            INNER JOIN pagetrees ON pagetrees.siteId = sites.id
                                            INNER JOIN pagetrees_templates ON pagetrees_templates.pagetreeId = pagetrees.id
                                            WHERE pagetrees_templates.templateId IN (${db.in(binds2, templateIds)})`, binds2)
    const sites = unique([...wholeSites, ...sitesWithPagetreesWithTemplate])
    return sites.map(s => ({ key: s.templateId, value: new Site(s) }))
  }
}
