import db from 'mysql2-async/db'
import { unique } from 'txstate-utils'
import { Site, SiteFilter, CreateSiteInput, PagetreeType, VersionedService, UpdateSiteInput } from 'internal'
import { nanoid } from 'nanoid'

const columns: string[] = ['sites.id', 'sites.name', 'sites.launchHost', 'sites.primaryPagetreeId', 'sites.rootAssetFolderId', 'sites.organizationId', 'sites.ownerId', 'sites.deletedAt', 'sites.deletedBy']

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
    where.push(`sites.rootAssetFolderId IN (${db.in(binds, filter.assetRootIds)})`)
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
    const sites = unique([...wholeSites, ...sitesWithPagetreesWithTemplate], 'id')
    return sites.map(s => ({ key: s.templateId, value: new Site(s) }))
  }
}

export async function createSite (versionedService: VersionedService, userId: string, args: CreateSiteInput) {
  return await db.transaction(async db => {
    // create the site, get the internal id for the page template
    const [siteId, templateInternalId] = await Promise.all([
      db.insert('INSERT INTO sites (name) VALUES (?)', [args.name]),
      db.getval('SELECT id FROM templates WHERE `key`=?', [args.rootPageTemplateKey])
    ])
    // create the assetfolder
    // create the primary pagetree
    // add root page template key to list of templates approved for the site
    const [folderId, pagetreeId] = await Promise.all([
      db.insert('INSERT INTO assetfolders (siteId, path, name, guid) VALUES (?,?,?,?)', [siteId, '/', args.name, nanoid(10)]),
      db.insert('INSERT INTO pagetrees (siteId, type, name, createdAt) VALUES (?,?,?, NOW())', [siteId, PagetreeType.PRIMARY, args.name]),
      db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [siteId, templateInternalId!])
    ])
    await db.update('UPDATE sites SET primaryPagetreeId = ?, rootAssetFolderId = ? WHERE id = ?', [pagetreeId, folderId, siteId])
    // create the root page.
    const dataId = await versionedService.create('page', { templateKey: args.rootPageTemplateKey, savedAtVersion: args.schemaVersion }, [{ name: 'template', values: [args.rootPageTemplateKey] }], userId, db)
    await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)`, [args.name, '/', 1, pagetreeId, dataId, nanoid(10)])
    return new Site(await db.getrow('SELECT * FROM sites WHERE id=?', [siteId]))
  })
}

export async function updateSite (site: Site, siteArgs: UpdateSiteInput) {
  const sitesUpdates: string[] = []
  const sitesBinds: string[] = []
  if (siteArgs.name) {
    sitesUpdates.push('name = ?')
    sitesBinds.push(siteArgs.name)
  }
  if (siteArgs.organizationId) {
    sitesUpdates.push('organizationId = ?')
    sitesBinds.push(siteArgs.organizationId)
  }
  if (siteArgs.launchHost) {
    sitesUpdates.push('launchHost = ?')
    sitesBinds.push(siteArgs.launchHost)
  }
  if (siteArgs.launchPath) {
    sitesUpdates.push('launchPath = ?')
    sitesBinds.push(siteArgs.launchPath)
  }
  return await db.transaction(async db => {
    if (siteArgs.ownerId) {
      const ownerId = await db.getval<string>('SELECT id FROM users WHERE login = ?', [siteArgs.ownerId])
      if (ownerId) {
        sitesUpdates.push('ownerId = ?')
        sitesBinds.push(ownerId)
      }
    }
    sitesBinds.push(site.id)
    if (sitesUpdates.length) {
      await db.update(`UPDATE sites
                        SET ${sitesUpdates.join(', ')}
                        WHERE id = ?`, sitesBinds)
      if (siteArgs.name) {
        // if the site is renamed, the root assetfolder and root page for all the pagetrees in the site need to be renamed too
        await db.update('UPDATE assetfolders SET name = ? WHERE id = ?', [siteArgs.name, site.rootAssetFolderInternalId])
        await db.update(`UPDATE pages
                          INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id
                          INNER JOIN sites ON pagetrees.siteId = sites.id
                          SET pages.name = ?
                          WHERE sites.id = ? AND pages.path = '/'`, [siteArgs.name, site.id])
      }
    }
    if (siteArgs.managerIds?.length) {
      const userBinds: string[] = []
      const userIds = await db.getvals<string>(`SELECT id from users WHERE login IN (${db.in(userBinds, siteArgs.managerIds)})`, userBinds)
      await db.delete('DELETE FROM sites_managers WHERE siteId = ?', [site.id])
      const managerBinds: string[] = []
      for (const id of userIds) {
        managerBinds.push(site.id)
        managerBinds.push(id)
      }
      await db.insert(`INSERT INTO sites_managers (siteId, userId) VALUES ${userIds.map(u => '(?,?)').join(', ')}`, managerBinds)
    }
  })
}

export async function deleteSite (site: Site, currentUserInternalId: number) {
  return await db.update('UPDATE sites SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [currentUserInternalId, site.id])
}

export async function undeleteSite (site: Site) {
  return await db.update('UPDATE sites SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [site.id])
}
