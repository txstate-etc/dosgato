import { type PageData, extractLinksFromText, replaceLinksInText, type PageExtras } from '@dosgato/templating'
import { type Context } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { unique, keyby, isNotNull, Cache, isNotBlank, intersect, stringify } from 'txstate-utils'
import {
  Site, type SiteFilter, PagetreeType, type VersionedService, createSiteComment, type UpdateSiteManagementInput,
  DeletedFilter, normalizeHost, parsePath, type CreatePageExtras, createVersionedPage, getPages, type Page, createPage,
  type AssetFolder, getAssetFolders, getAssets, createAsset, createAssetFolder, DeleteStateInput, migratePage, LaunchState
} from '../internal.js'

const columns: string[] = ['sites.id', 'sites.name', 'sites.launchHost', 'sites.launchPath', 'sites.launchEnabled', 'sites.primaryPagetreeId', 'sites.organizationId', 'sites.ownerId', 'sites.deletedAt', 'sites.deletedBy']
const columnsjoined = columns.join(', ')

interface SiteNode {
  stopHere?: string
  keepGoing: Record<string, SiteNode>
}

const sitesByUrlCache = new Cache(async () => {
  const sites = await db.getall<{ id: number, launchHost: string, launchPath: string | null }>('SELECT * from sites WHERE deletedAt IS NULL AND launchEnabled = 1')
  const sitesByUrl: SiteNode = { keepGoing: {} }
  for (const site of sites) {
    const searchhost = normalizeHost(site.launchHost)
    const searchpaths = (site.launchPath ?? '').split('/').filter(isNotBlank)
    const search = [searchhost, ...searchpaths]
    let current = sitesByUrl
    for (let i = 0; i < search.length; i++) {
      current.keepGoing[search[i]] ??= { keepGoing: {} }
      current = current.keepGoing[search[i]]
      if (i === search.length - 1) current.stopHere = String(site.id)
    }
  }
  return sitesByUrl
})

async function processFilters (filter?: SiteFilter) {
  const binds: string[] = []
  const where: string[] = []
  if (filter?.launchUrls?.length) {
    const internalIds = (await Promise.all(filter.launchUrls.map(getSiteIdByLaunchUrl))).filter(isNotNull)
    filter.ids = intersect({ skipEmpty: true }, filter.ids, ['-1', ...internalIds])
  }
  if (filter?.ids?.length) {
    where.push(`sites.id IN (${db.in(binds, filter.ids)})`)
  }
  if (filter?.names?.length) {
    where.push(`sites.name IN (${db.in(binds, filter.names)})`)
  }
  if (filter?.launched != null) {
    if (filter.launched) {
      where.push('sites.launchEnabled = 1')
    } else {
      where.push('sites.launchEnabled != 1') // pre-launch or decommissioned
    }
  }
  if (filter?.launchStates?.length) {
    where.push(`sites.launchEnabled IN (${db.in(binds, filter.launchStates)})`)
  }
  if (filter?.deleted) {
    if (filter.deleted === DeletedFilter.ONLY) {
      where.push('sites.deletedAt IS NOT NULL')
    } else if (filter.deleted === DeletedFilter.HIDE) {
      where.push('sites.deletedAt IS NULL')
    }
  } else {
    where.push('sites.deletedAt IS NULL')
  }
  if (filter?.organizationIds) {
    where.push(`sites.organizationId IN (${db.in(binds, filter.organizationIds)})`)
  }
  if (filter?.ownerInternalIds) {
    where.push(`sites.ownerId IN (${db.in(binds, filter.ownerInternalIds)})`)
  }
  return { where, binds }
}

export async function getSites (filter?: SiteFilter) {
  const { binds, where } = await processFilters(filter)
  let query = `SELECT ${columnsjoined} FROM sites`
  if (where.length) {
    query += ` WHERE (${where.join(') AND (')})`
  }
  const siterows = await db.getall(query + ' ORDER BY sites.name', binds)
  return siterows.map(s => new Site(s))
}

export async function getSitesByTemplate (templateIds: string[], atLeastOneTree?: boolean) {
  const binds: string[] = []

  const wholeSites = await db.getall(`SELECT ${columnsjoined}, sites_templates.templateId as templateId FROM sites
                                 INNER JOIN sites_templates ON sites.id = sites_templates.siteId
                                 WHERE sites_templates.templateId IN (${db.in(binds, templateIds)})`, binds)
  if (!atLeastOneTree) {
    return wholeSites.map(s => ({ key: String(s.templateId), value: new Site(s) }))
  } else {
    // also return any sites where one or more pagetrees are able to use the template
    const binds2: string[] = []
    const sitesWithPagetreesWithTemplate = await db.getall(`SELECT ${columnsjoined}, pagetrees_templates.templateId as templateId FROM sites
                                            INNER JOIN pagetrees ON pagetrees.siteId = sites.id
                                            INNER JOIN pagetrees_templates ON pagetrees_templates.pagetreeId = pagetrees.id
                                            WHERE pagetrees_templates.templateId IN (${db.in(binds2, templateIds)})`, binds2)
    const sites = unique([...wholeSites, ...sitesWithPagetreesWithTemplate], 'id')
    return sites.map(s => ({ key: String(s.templateId), value: new Site(s) }))
  }
}

export async function getSitesByOwnerInternalId (ownerInternalIds: number[]) {
  return await getSites({ ownerInternalIds })
}

export async function getSitesByManagerInternalId (managerInternalIds: number[], filter?: SiteFilter) {
  const { binds, where } = await processFilters(filter)

  where.push(`sites_managers.userId IN (${db.in(binds, managerInternalIds)})`)

  const rows = await db.getall(`SELECT ${columnsjoined}, sites_managers.userId
                                FROM sites
                                INNER JOIN sites_managers ON sites.id = sites_managers.siteId
                                WHERE (${where.join(') AND (')})`, binds)
  return rows.map(row => ({ key: row.userId, value: new Site(row) }))
}

export async function getSiteIdByLaunchUrl (launchUrl: string) {
  const sitesByUrlTree = await sitesByUrlCache.get()
  const parsed = new URL(launchUrl)
  const { path } = parsePath(parsed.pathname)
  const searchsegments = [normalizeHost(parsed.hostname), ...path.split('/').slice(1)]
  let current = sitesByUrlTree
  for (const seg of searchsegments) {
    if (!current.keepGoing[seg]) return current.stopHere
    current = current.keepGoing[seg]
  }
  return current.stopHere
}

export async function siteNameIsUnique (name: string) {
  const count = await db.getval<number>('SELECT COUNT(*) FROM sites WHERE name = ?', [name])
  return count === 0
}

export async function createSite (versionedService: VersionedService, userId: string, name: string, data: PageData & { legacyId?: string }, extra?: CreatePageExtras) {
  return await db.transaction(async db => {
    // create the site, get the internal id for the page template
    const siteId = await db.insert('INSERT INTO sites (name) VALUES (?)', [name])
    const templateInternalId = await db.getval('SELECT id FROM templates WHERE `key`=?', [data.templateKey])
    if (!templateInternalId) throw new Error(`${data.templateKey} is not a recognized template key.`)
    const currentUserInternalId = await db.getval<number>('SELECT id FROM users WHERE login = ?', [userId])
    // create the assetfolder
    // create the primary pagetree
    // add root page template key to list of templates approved for the site
    const createdAt = data.legacyId && isNotBlank(extra?.createdAt) ? new Date(extra!.createdAt) : new Date()
    const pagetreeId = await db.insert('INSERT INTO pagetrees (siteId, type, name, createdAt, promotedAt) VALUES (?,?,?, ?, ?)', [siteId, PagetreeType.PRIMARY, name, createdAt, createdAt])
    const folderId = await db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?,?,?,?,?)', [siteId, pagetreeId, extra?.linkId ?? nanoid(10), '/', name])
    await db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [siteId, templateInternalId])
    await db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetreeId, siteId])
    // create the root page.
    const dataId = await createVersionedPage(versionedService, userId, data, db, extra)
    await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId, siteId, title, templateKey)
      VALUES (?,?,?,?,?,?,?,?,?)`, [name, '/', 1, pagetreeId, dataId, extra?.linkId ?? nanoid(10), siteId, data.title, data.templateKey])
    await createSiteComment(String(siteId), `Site created: ${name}`, currentUserInternalId!, db)
    return new Site(await db.getrow('SELECT * FROM sites WHERE id=?', [siteId]))
  })
}

async function renameSiteInsideTransaction (site: Site, name: string, currentUserInternalId: number, db: Queryable) {
  await db.update('UPDATE sites SET name = ? WHERE id = ?', [name, site.id])
  // if the site is renamed, the root assetfolders and root pages for all the pagetrees in the site need to be renamed too
  // update the pagetree names
  await db.update(`UPDATE pagetrees SET name = REPLACE(name, '${site.name}', ?) WHERE siteId = ?`, [name, site.id])
  await db.update('UPDATE assetfolders f INNER JOIN pagetrees pt ON pt.id=f.pagetreeId SET f.name = pt.name WHERE pt.siteId = ? AND f.path="/"', [site.id])
  await db.update('UPDATE pages p INNER JOIN pagetrees pt ON pt.id=p.pagetreeId SET p.name = pt.name WHERE pt.siteId = ? AND p.path="/"', [site.id])
  await createSiteComment(site.id, `Site renamed. Former name: ${site.name} New name: ${name}`, currentUserInternalId, db)
}

export async function renameSite (site: Site, name: string, currentUserInternalId: number) {
  await db.transaction(async db => {
    await renameSiteInsideTransaction(site, name, currentUserInternalId, db)
  })
}

export async function setLaunchURL (site: Site, host: string | undefined, path: string | undefined, enabled: LaunchState, currentUserInternalId: number) {
  await db.transaction(async db => {
    const fetchedSite = new Site(await db.getrow('SELECT * FROM sites WHERE id = ?', [site.id]))
    let finalEnabled = enabled
    if (enabled === LaunchState.LAUNCHED && !host) {
      finalEnabled = LaunchState.PRELAUNCH
    }
    await db.update('UPDATE sites SET launchHost = ?, launchPath = ?, launchEnabled = ? WHERE id = ?', [(isNotBlank(host) ? host : null), (isNotBlank(path) ? path : '/'), finalEnabled, site.id])
    if (isNotNull(fetchedSite.url)) {
      if (host && (fetchedSite.url.host !== host || fetchedSite.url.path !== path)) {
        await createSiteComment(site.id, `Public URL ${host ? `updated to https://${host}${path ?? ''}` : 'removed'}`, currentUserInternalId, db)
      }
    } else {
      if (isNotNull(host)) {
        await createSiteComment(site.id, `Public URL updated to https://${host}${path ?? ''}`, currentUserInternalId, db)
      }
    }
    if (fetchedSite.url?.enabled !== finalEnabled) {
      if (finalEnabled === LaunchState.PRELAUNCH) {
        await createSiteComment(site.id, `${site.name} is now in the pre-launch state`, currentUserInternalId, db)
      } else if (finalEnabled === LaunchState.LAUNCHED) {
        await createSiteComment(site.id, `${site.name} is now live`, currentUserInternalId, db)
      } else {
        await createSiteComment(site.id, `${site.name} has been decommissioned`, currentUserInternalId, db)
      }
    }
  })
  await sitesByUrlCache.clear()
}

export async function updateSiteManagement (site: Site, args: UpdateSiteManagementInput, currentUserInternalId: number) {
  await db.transaction(async db => {
    const updates: string[] = []
    const binds: (string | number | null)[] = []
    const auditComments: string[] = []

    // Handle organization updates
    let newOrganization: { id: number, name: string } | undefined
    if (args.organizationId) {
      newOrganization = await db.getrow<{ id: number, name: string }>('SELECT id, name FROM organizations WHERE id = ?', [args.organizationId])
    }
    updates.push('organizationId = ?')
    binds.push(newOrganization?.id ?? null)
    if (site.organizationId !== String(newOrganization?.id)) {
      if (site.organizationId) {
        const formerOrganization = await db.getval<string>('SELECT name FROM organizations WHERE id = ?', [site.organizationId])
        auditComments.push(`Removed organization ${formerOrganization!}.`)
      }
      if (newOrganization) auditComments.push(`Added organization ${newOrganization.name}.`)
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
    const managerBinds: (string | number)[] = []
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
    for (const comment of auditComments) {
      await createSiteComment(site.id, comment, currentUserInternalId, db)
    }
  }, { retries: 5 })
}

export async function deleteSite (site: Site, currentUserInternalId: number) {
  await db.transaction(async db => {
    await renameSiteInsideTransaction(site, site.name + DateTime.local().toFormat('yyyyMMddHHmmss'), currentUserInternalId, db)
    return await db.update('UPDATE sites SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [currentUserInternalId, site.id])
  })
}

export async function undeleteSite (site: Site) {
  return await db.update('UPDATE sites SET deletedAt = NULL, deletedBy = NULL WHERE id = ?', [site.id])
}

interface DuplicateContext {
  oldSiteId: string
  newSiteId: string
  newSiteName: string
  userId: string
  ctx: Context
}

function fixLinks (obj: any, context: DuplicateContext) {
  if (typeof obj === 'string') {
    const extracted = extractLinksFromText(obj)
    const resolved = new Map<string, string | undefined>()
    for (const link of extracted) {
      const strLink = stringify(link)
      if ('siteId' in link && link.siteId === context.oldSiteId) {
        resolved.set(strLink, stringify({ ...link, siteId: context.newSiteId, path: link.path?.replace(/^\/[^/]+/, `/${context.newSiteName}`) }))
      } else {
        resolved.set(strLink, strLink)
      }
    }
    return replaceLinksInText(obj, resolved)
  }
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) obj[i] = fixLinks(obj[i], context)
    } else {
      const keys = Object.keys(obj)
      for (const k of keys) {
        obj[k] = fixLinks(obj[k], context)
      }
      return obj
    }
  }
  return obj
}

async function duplicateChildren (page: Page, into: Page, versionedService: VersionedService, path: string, context: DuplicateContext) {
  const children = await getPages({ internalIdPaths: ['/' + [...page.pathSplit, page.internalId].join('/')], deleteStates: [DeleteStateInput.NOTDELETED] })
  for (const child of children) {
    const childPath = path + '/' + child.name
    const versioned = await versionedService.get(child.intDataId)
    const extras: PageExtras = {
      query: context.ctx.query,
      pagePath: childPath,
      name: child.name,
      linkId: child.linkId,
      pagetreeId: child.pagetreeId,
      siteId: child.siteId
    }
    const migrated = await migratePage(versioned!.data, extras)
    const data = fixLinks(migrated, context)
    // add template key to list of templates approved for the site
    // TODO: check whether the template is universal first
    // TODO: add component templates to the approved list as well
    const templateInternalId = await db.getval('SELECT id FROM templates WHERE `key`=?', [data.templateKey])
    if (!templateInternalId) throw new Error(`${data.templateKey} is not a recognized template key.`)
    await db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?) ON DUPLICATE KEY UPDATE siteId=siteId', [context.newSiteId, templateInternalId])
    const newPageId = await createPage(versionedService, context.userId, into, undefined, child.name, data, { linkId: child.linkId })
    const newPage = (await getPages({ internalIds: [newPageId] }))[0]!
    await duplicateChildren(child, newPage, versionedService, childPath, context)
  }
}

async function duplicateAssets (folder: AssetFolder, into: AssetFolder, versionedService: VersionedService, context: DuplicateContext) {
  const assets = await getAssets({ folderIds: [folder.id], deleteStates: [DeleteStateInput.NOTDELETED] })
  for (const a of assets) {
    const versioned = (await versionedService.get(a.intDataId))!
    await createAsset(versionedService, context.userId, { checksum: a.checksum, filename: a.filename, folderId: into.id, mime: a.mime, name: a.name.toString(), size: a.size, width: a.box?.width, height: a.box?.height, linkId: a.linkId, uploadedFilename: versioned.data.uploadedFilename, meta: a.meta })
  }

  const folders = await getAssetFolders({ internalIdPaths: ['/' + [...folder.pathSplit, folder.internalId].join('/')], deleteStates: [DeleteStateInput.NOTDELETED] })
  for (const f of folders) {
    const newFolder = await createAssetFolder({ name: f.name, parentId: into.id })
    await duplicateAssets(f, newFolder, versionedService, context)
  }
}

export async function duplicateSite (siteId: string, newName: string, versionedService: VersionedService, userId: string, ctx: Context) {
  const [rootPage] = await getPages({ siteIds: [siteId], maxDepth: 0 })
  const [rootFolder] = await getAssetFolders({ siteIds: [siteId], maxDepth: 0 })
  const versioned = await versionedService.get(rootPage.intDataId)
  const extras: PageExtras = {
    query: ctx.query,
    pagePath: `/${newName}`,
    name: newName,
    linkId: rootPage.linkId
  }
  const migrated = await migratePage(versioned!.data, extras)
  let context: DuplicateContext
  const [newSiteId, newPageId, newFolderId] = await db.transaction(async db => {
    const newSiteId = await db.insert('INSERT INTO sites (name) VALUES (?)', [newName])
    context = { oldSiteId: siteId, newSiteId: String(newSiteId), newSiteName: newName, userId, ctx }
    const data = fixLinks(migrated, context)
    // create the site, get the internal id for the page template
    const templateInternalId = await db.getval('SELECT id FROM templates WHERE `key`=?', [data.templateKey])
    if (!templateInternalId) throw new Error(`${data.templateKey} is not a recognized template key.`)
    const currentUserInternalId = await db.getval<number>('SELECT id FROM users WHERE login = ?', [userId])
    const createdAt = new Date()
    // create the primary pagetree
    const pagetreeId = await db.insert('INSERT INTO pagetrees (siteId, type, name, createdAt, promotedAt) VALUES (?,?,?, ?, ?)', [newSiteId, PagetreeType.PRIMARY, newName, createdAt, createdAt])
    // create the assetfolder
    const newFolderId = await db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?,?,?,?,?)', [newSiteId, pagetreeId, rootFolder.linkId, '/', newName])
    // add root page template key to list of templates approved for the site
    await db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [newSiteId, templateInternalId])
    await db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetreeId, newSiteId])
    // create the root page.
    const dataId = await createVersionedPage(versionedService, userId, data, db)
    const oldSiteName = await db.getval<string>('SELECT name FROM sites WHERE id=?', [siteId])
    const newPageId = await db.insert(`
      INSERT INTO pages (name, path, displayOrder, pagetreeId, dataId, linkId, siteId, title, templateKey)
      VALUES (?,?,?,?,?,?,?,?,?)`, [newName, '/', 1, pagetreeId, dataId, rootPage.linkId, newSiteId, data.title, data.templateKey])
    await createSiteComment(String(newSiteId), `Site duplicated from ${oldSiteName!} into ${newName}.`, currentUserInternalId!, db)
    return [String(newSiteId), newPageId, newFolderId]
  })
  const intoPage = (await getPages({ internalIds: [newPageId] }))[0]!
  await duplicateChildren(rootPage, intoPage, versionedService, '/' + rootPage.name, context!)
  const intoFolder = (await getAssetFolders({ internalIds: [newFolderId] }))[0]!
  await duplicateAssets(rootFolder, intoFolder, versionedService, context!)
  return newSiteId
}
