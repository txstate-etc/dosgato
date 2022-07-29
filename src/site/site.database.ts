import db from 'mysql2-async/db'
import { unique, keyby } from 'txstate-utils'
import { Site, SiteFilter, CreateSiteInput, PagetreeType, VersionedService, formatSavedAtVersion, createSiteComment, UpdateSiteManagementInput } from '../internal.js'
import { nanoid } from 'nanoid'

const columns: string[] = ['sites.id', 'sites.name', 'sites.launchHost', 'sites.launchPath', 'sites.primaryPagetreeId', 'sites.rootAssetFolderId', 'sites.organizationId', 'sites.ownerId', 'sites.deletedAt', 'sites.deletedBy']

function processFilters (filter?: SiteFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.ids?.length) {
    where.push(`sites.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.names?.length) {
    where.push(`sites.name IN (${db.in(binds, filter.names)})`)
  }
  if (filter?.launched != null) {
    if (filter.launched) {
      where.push('sites.launchHost IS NOT NULL')
    } else {
      where.push('sites.launchHost IS NULL')
    }
  }
  if (filter?.launchUrls?.length) {
    const ors = []
    for (const launchUrl of filter.launchUrls) {
      ors.push('(sites.launchHost = ? AND sites.launchPath like ?)')
      db.in(binds, [launchUrl.host, `${launchUrl.path}%`])
    }
    where.push(ors.join(' OR '))
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
  const sites = await db.getall(query + ' ORDER BY sites.name', binds)
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

export async function getSitesByGroupIds (groupIds: string[]) {
  const rows = await db.getall(`SELECT s.*, gs.groupId
                                FROM sites s
                                INNER JOIN groups_sites gs ON gs.siteId=s.id
                                WHERE gs.groupId IN (${db.in([], groupIds)})`, groupIds)
  return rows.map(r => ({ key: String(r.groupId), value: new Site(r) }))
}

export async function getSitesByOwnerInternalId (ownerInternalIds: number[]) {
  const rows = await db.getall(`SELECT sites.*
                                FROM sites
                                INNER JOIN users ON sites.ownerId = users.id
                                WHERE users.id IN (${db.in([], ownerInternalIds)})`, ownerInternalIds)
  return rows.map(row => new Site(row))
}

export async function getSitesByManagerInternalId (managerInternalIds: number[]) {
  const rows = await db.getall(`SELECT sites.*, sites_managers.userId
                                FROM sites
                                INNER JOIN sites_managers ON sites.id = sites_managers.siteId
                                WHERE sites_managers.userId IN (${db.in([], managerInternalIds)})`, managerInternalIds)
  return rows.map(row => ({ key: row.userId, value: new Site(row) }))
}

export async function siteNameIsUnique (name: string) {
  const count = await db.getval<number>('SELECT COUNT(*) FROM sites WHERE name = ?', [name])
  return count === 0
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
    const dataId = await versionedService.create('page', { templateKey: args.rootPageTemplateKey, savedAtVersion: formatSavedAtVersion(args.schemaVersion) }, [{ name: 'template', values: [args.rootPageTemplateKey] }], userId, db)
    await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId)
      VALUES (?,?,?,?,?,?)`, [args.name, '/', 1, pagetreeId, dataId, nanoid(10)])
    return new Site(await db.getrow('SELECT * FROM sites WHERE id=?', [siteId]))
  })
}

export async function renameSite (site: Site, name: string, currentUserInternalId: number) {
  return await db.transaction(async db => {
    await db.update('UPDATE sites SET name = ? WHERE id = ?', [name, site.id])
    // if the site is renamed, the root assetfolder and root page for all the pagetrees in the site need to be renamed too
    await db.update('UPDATE assetfolders SET name = ? WHERE id = ?', [name, site.rootAssetFolderInternalId])
    await db.update(`UPDATE pages
                     INNER JOIN pagetrees on pages.pagetreeId = pagetrees.id
                     INNER JOIN sites ON pagetrees.siteId = sites.id
                     SET pages.name = ?
                     WHERE sites.id = ? AND pages.path = '/'`, [name, site.id])
    await createSiteComment(site.id, `Site renamed. Former name: ${site.name} New name: ${name}`, currentUserInternalId, db)
  })
}

export async function setLaunchURL (site: Site, host: string, path: string, currentUserInternalId: number) {
  return await db.transaction(async db => {
    await db.update('UPDATE sites SET launchHost = ?, launchPath = ? WHERE id = ?', [host, path, site.id])
    await createSiteComment(site.id, `Public URL updated to ${`https://${host}${path}`}`, currentUserInternalId, db)
  })
}

export async function updateSiteManagement (site: Site, args: UpdateSiteManagementInput, currentUserInternalId: number) {
  const updates: string[] = []
  const binds: (string|number|null)[] = []
  const auditComments: string[] = []
  return await db.transaction(async db => {
    // Handle organization updates
    const formerOrganization = site.organizationId ? await db.getval<string>('SELECT name FROM organizations WHERE id = ?', [site.organizationId]) : undefined
    updates.push('organizationId = ?')
    const orgId = args.organizationId ?? null
    binds.push(orgId)
    if (site.organizationId !== args.organizationId) {
      if (formerOrganization) auditComments.push(`Removed organization ${formerOrganization}.`)
      if (args.organizationId) {
        const newOrganizationName = await db.getval<string>('SELECT name FROM organizations WHERE id = ?', [args.organizationId])
        auditComments.push(`Added organization ${newOrganizationName!}.`)
      }
    }
    // Handle owner updates
    const formerOwnerId = site.ownerId ? await db.getval<string>('SELECT login FROM users WHERE id = ?', [site.ownerId]) : undefined
    const newOwnerInternalId = args.ownerId ? await db.getval<number>('SELECT id FROM users WHERE login = ?', [args.ownerId]) : undefined
    updates.push('ownerId = ?')
    binds.push(newOwnerInternalId ?? null)
    if (site.ownerId !== newOwnerInternalId) {
      if (formerOwnerId) auditComments.push(`Removed owner ${formerOwnerId}`)
      if (args.ownerId) auditComments.push(`Added owner ${args.ownerId}`)
    }
    if (updates.length) {
      binds.push(site.id)
      await db.update(`UPDATE sites
                       SET ${updates.join(', ')}
                       WHERE id = ?`, binds)
    }
    // Handle manager updates
    const formerManagerInternalIds = await db.getvals<number>('SELECT userId FROM sites_managers WHERE siteId = ?', [site.id])
    const newManagerInternalIds = args.managerIds?.length ? await db.getvals<number>(`SELECT id FROM users WHERE login IN (${db.in([], args.managerIds)})`, args.managerIds) : []
    await db.delete('DELETE FROM sites_managers WHERE siteId = ?', [site.id])
    const managerBinds: (string|number)[] = []
    for (const id of newManagerInternalIds) {
      managerBinds.push(site.id)
      managerBinds.push(id)
    }
    if (newManagerInternalIds.length) {
      await db.insert(`INSERT INTO sites_managers (siteId, userId) VALUES ${newManagerInternalIds.map(u => '(?,?)').join(', ')}`, managerBinds)
    }
    const managersRemoved = formerManagerInternalIds.filter(man => !newManagerInternalIds.includes(man))
    const managersAdded = newManagerInternalIds.filter(man => !formerManagerInternalIds.includes(man))
    const idsToLookup = [...managersRemoved, ...managersAdded]
    if (idsToLookup.length) {
      const managers = keyby((await db.getall(`SELECT id, login FROM users WHERE id IN (${db.in([], idsToLookup)})`, idsToLookup)), 'id')
      auditComments.push(...managersRemoved.map(m => `Removed manager ${managers[m].login}.`))
      auditComments.push(...managersAdded.map(m => `Added manager ${managers[m].login}.`))
    }
  })
}

export async function deleteSite (site: Site, currentUserInternalId: number) {
  return await db.update('UPDATE sites SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [currentUserInternalId, site.id])
}

export async function undeleteSite (site: Site) {
  return await db.update('UPDATE sites SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [site.id])
}
