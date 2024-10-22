import { type PageData } from '@dosgato/templating'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { HttpError } from 'fastify-txstate'
import db from 'mysql2-async/db'
import { groupby, isNotBlank, pick } from 'txstate-utils'
import {
  createPage, type CreatePageInput, createPagetree, createSite, DeleteState, getEnabledUser,
  getPageIndexes, GlobalRuleService, logMutation, makeSafe, numerate, Page, type PageRule,
  PageRuleService, PageService, PageServiceInternal, PagetreeServiceInternal, type PagetreeType,
  SiteService, SiteServiceInternal, templateRegistry, VersionedService, createPageInTransaction,
  getPages, jsonlGzStream, gzipJsonLToJSON, TemplateService, DeleteStateInput, migratePage,
  systemContext, type DGContext, LaunchState, setPageSearchCodes,
  removeUnreachableComponents
} from '../internal.js'

export interface PageExport {
  name: string
  path: string
  linkId: string
  data: PageData & { legacyId?: string }
  version: number
  createdBy?: string
  createdAt?: string
  modifiedBy?: string
  modifiedAt?: string
}

interface RootPage {
  id: string
  linkId: string
  path: string
  name: string
  title?: string
  template?: {
    key: string
    name: string
  }
  modifiedAt: string
  modifiedBy: {
    id: string
  }
  published: boolean
  publishedAt?: string
  hasUnpublishedChanges: boolean
  deleteState: string
  children: {
    id: string
  }[]
  pagetree: {
    id: string
    name: string
    type: string
  }
  site: {
    id: string
    name: string
    launchState: string
  }
  permissions: {
    create: boolean
    update: boolean
    publish: boolean
    move: boolean
    delete: boolean
    undelete: boolean
    unpublish: boolean
  }
}

async function handleUpload (req: FastifyRequest) {
  const body: any = {}
  let pageRecord: PageExport | undefined
  for await (const part of req.parts()) {
    if ('file' in part) {
      if (part.mimetype !== 'application/json') throw new HttpError(400, 'Import files must be in JSON format.')
      try {
        pageRecord = JSON.parse((await part.toBuffer()).toString('utf8')) as PageExport
        if (!pageRecord.name || !pageRecord.linkId || !pageRecord.data.templateKey) throw new Error('not export file')
      } catch (e: any) {
        throw new HttpError(400, 'Uploaded JSON file was not a Dos Gato export file.')
      }
    } else {
      body[part.fieldname] = (part as any).value
    }
  }
  if (!pageRecord) throw new HttpError(400, 'Must upload a file to import.')
  return { pageRecord, body }
}

async function handleUploads (req: FastifyRequest, handleFile: (pageRecord: PageExport) => Promise<void>) {
  for await (const part of req.files()) {
    if (part.mimetype === 'application/json') {
      let pageRecord: PageExport
      try {
        pageRecord = JSON.parse((await part.toBuffer()).toString('utf8'))
        if (!pageRecord.name || !pageRecord.linkId || !pageRecord.data.templateKey) throw new Error()
      } catch (e: any) {
        throw new HttpError(400, 'At least one uploaded JSON file was not a Dos Gato export file.')
      }
      await handleFile(pageRecord)
    } else if (part.mimetype === 'application/x-gzip') {
      const stream = gzipJsonLToJSON(part.file)
      for await (const pageRecord of stream) {
        try {
          if (pageRecord.name && pageRecord.linkId && pageRecord.data.templateKey) await handleFile(pageRecord)
          else throw new Error()
        } catch (e: any) {
          if ('statusCode' in e && e.statusCode === 403) {
            throw e
          }
          throw new HttpError(400, 'At least one file in the uploaded archive was not a Dos Gato export file.')
        }
      }
    }
  }
}

export async function createPageRoutes (app: FastifyInstance) {
  app.post('/pages/site', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Site import must be multipart.')

    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const siteService = ctx.svc(SiteService)
    const siteServiceInternal = ctx.svc(SiteServiceInternal)
    if (!siteService.mayCreate() || !ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not permitted to create new sites by importing a file.')
    const { pageRecord, body } = await handleUpload(req)
    if (!pageRecord.data.legacyId) throw new HttpError(400, 'The site import endpoint is only meant for migrating from another CMS.')
    const [existing] = await siteServiceInternal.find({ names: [pageRecord.name] })
    if (existing) throw new HttpError(409, 'The site you are trying to import already exists, update the page instead.')
    const [existingPage] = await ctx.svc(PageServiceInternal).find({ legacyIds: [pageRecord.data.legacyId] })
    if (existingPage) throw new HttpError(400, `Another page has the legacy id ${pageRecord.data.legacyId}. Use /pages/update/:id instead.`)
    const site = await createSite(ctx.svc(VersionedService), user.id, makeSafe(pageRecord.name), pageRecord.data, { ...pick(pageRecord, 'linkId', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'), publishedAt: body?.publishedAt, publishedBy: body?.publishedBy })
    const pagetree = (await ctx.svc(PagetreeServiceInternal).findBySiteId(site.id))[0]
    return { id: site.id, name: site.name, pagetree: { id: pagetree.id, name: pagetree.name } }
  })

  app.post<{ Params: { siteId: string } }>('/pages/pagetree/:siteId', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Pagetree import must be multipart.')

    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const siteServiceInternal = ctx.svc(SiteServiceInternal)
    const site = await siteServiceInternal.findById(req.params.siteId)
    if (!site) throw new HttpError(404, 'Site could not be found.')
    if (!ctx.svc(SiteService).mayManageState(site) || !ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not permitted to create new pagetrees by importing a file.')
    const { pageRecord, body } = await handleUpload(req)
    if (!pageRecord.data.legacyId) throw new HttpError(400, 'The pagetree import endpoint is only meant for migrating from another CMS.')
    const [existingPage] = await ctx.svc(PageServiceInternal).find({ legacyIds: [pageRecord.data.legacyId] })
    if (existingPage) throw new HttpError(400, 'Another page has that legacy id. Use /pages/update/:id instead.')
    const pagetree = await createPagetree(ctx.svc(VersionedService), user, site, pageRecord.data, { ...pick(pageRecord, 'linkId', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'), publishedAt: body?.publishedAt, publishedBy: body?.publishedBy })
    return { id: pagetree.id, name: pagetree.name }
  })

  app.post<{ Params: { pageid: string } }>('/pages/update/:pageid', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page update from export file must be multipart.')

    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authorized

    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const versionedService = ctx.svc(VersionedService)

    const page = await svcPageInternal.findById(req.params.pageid)
    if (!page) throw new HttpError(404, 'Specified page does not exist.')
    if (!svcPage.mayUpdate(page)) throw new HttpError(403, `You are not permitted to update page ${String(page.name)}.`)
    const { pageRecord, body } = await handleUpload(req)
    if (!body?.migrate) delete pageRecord.data.legacyId
    if (pageRecord.data.legacyId) {
      const allowed = ctx.svc(GlobalRuleService).mayOverrideStamps()
      if (!allowed) throw new HttpError(403, 'You are not permitted to migrate content from another CMS.')
    }
    if (body?.publishedAt || body?.publishedBy) {
      if (!pageRecord.data.legacyId) throw new HttpError(400, 'Only pages being imported from another system may override published stamps.')
    }
    const pagetree = (await ctx.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await ctx.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const parent = page.parentInternalId ? (await ctx.svc(PageServiceInternal).findByInternalId(page.parentInternalId)) : undefined
    const extras = {
      query: systemContext().query,
      siteId: site.id,
      pagetreeId: pagetree.id,
      parentId: parent?.id,
      pagePath: `${parent?.resolvedPath ?? ''}/${page.name}`,
      name: page.name,
      page: undefined // treate a migration update like creation as far as validation is concerned
    }
    const migrated = removeUnreachableComponents(await migratePage(pageRecord.data, extras))
    const response = await svcPage.validatePageData(migrated, extras)
    try {
      await svcPage.validatePageTemplates(migrated, { page })
    } catch (e: any) {
      if (migrated.legacyId) response.addMessage(e.message)
      else throw new HttpError(403, e.message)
    }
    if (!response.success && !migrated.legacyId) throw new HttpError(422, `${response.messages[0].arg ?? ''}: ${response.messages[0].message}`)

    const indexes = getPageIndexes(migrated)
    const modifiedBy = migrated.legacyId && isNotBlank(pageRecord.modifiedBy) ? pageRecord.modifiedBy : user.id
    const modifiedAt = migrated.legacyId && isNotBlank(pageRecord.modifiedAt) ? new Date(pageRecord.modifiedAt) : undefined
    const publishedAt = isNotBlank(body?.publishedAt) ? new Date(body.publishedAt) : undefined
    await db.transaction(async db => {
      await versionedService.update(page.intDataId, migrated, indexes, { user: modifiedBy, date: modifiedAt }, db)
      if (publishedAt && modifiedAt && publishedAt >= modifiedAt) await versionedService.tag(page.intDataId, 'published', undefined, body.publishedBy ?? modifiedBy, publishedAt, db)
      await db.update('UPDATE pages SET title=?, templateKey=? WHERE dataId=?', [migrated.title, migrated.templateKey, page.dataId])
      await setPageSearchCodes({ internalId: page.internalId, name: page.name, title: migrated.title }, db)
    }, { retries: 2 })

    return { id: page.id, linkId: page.linkId, messages: response.messages }
  })

  app.post<{ Params: { parentPageId: string }, Body?: CreatePageInput }>('/pages/:parentPageId', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page import must be multipart.')
    const startTime = new Date()
    const ctx = templateRegistry.getCtx(req)
    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const svcTmpl = ctx.svc(TemplateService)
    const versionedService = ctx.svc(VersionedService)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const parent = await svcPageInternal.findById(req.params.parentPageId)
    if (!parent) throw new HttpError(404, 'Specified page does not exist.')
    if (!svcPage.mayCreate(parent)) throw new HttpError(403, `Current user is not permitted to import pages beneath ${String(parent.name)}.`)

    const above = req.body?.abovePage ? await svcPageInternal.findById(req.body?.abovePage) : undefined
    const pages = await svcPageInternal.getPageChildren(parent, false)
    const nameSet = new Set(pages.map(p => p.name))
    let first = true
    let firstInternalId: number | undefined
    const parentsByPath: Record<string, Page> = {}
    await db.transaction(async db => {
      await handleUploads(req, async (pageRecord) => {
        delete pageRecord.data.legacyId
        let newPageName = makeSafe(pageRecord.name)
        let actualParent = parent
        const placeAbove = first ? above : undefined
        const pathparts = pageRecord.path.split('/')
        if (first) while (nameSet.has(newPageName)) newPageName = numerate(newPageName)
        else {
          actualParent = parentsByPath[pathparts.slice(0, -1).join('.')]
        }
        if (!actualParent) throw new HttpError(400, 'Uploaded archive contains page exports in an inconsistent order or with missing parent pages.')
        const template = await svcTmpl.findByKey(pageRecord.data.templateKey)
        if (!template) throw new HttpError(400, 'Template ' + pageRecord.data.templateKey + ' is not recognized.')
        if (!await svcTmpl.mayUseOnPage(template, parent)) throw new HttpError(403, 'At least one page being imported is using a template not compatible with the site being imported into.')
        const pageInternalId = await createPageInTransaction(db, versionedService, user.id, actualParent, placeAbove, newPageName, pageRecord.data, {
          ...pick(pageRecord, 'createdBy', 'createdAt', 'modifiedBy', 'modifiedAt', 'linkId')
        })
        const [page] = await getPages({ internalIds: [pageInternalId] }, db)
        parentsByPath[pathparts.join('.')] = page
        if (first) firstInternalId = pageInternalId
        first = false
      })
    })

    if (!firstInternalId) throw new HttpError(400, 'No valid page exports were uploaded.')
    const page = (await svcPageInternal.findByInternalId(firstInternalId))!
    logMutation(new Date().getTime() - startTime.getTime(), 'importPage', 'mutation uploadImportPage (RESTful)', user.id, { parentId: parent.id }, { success: true, pagesImported: Object.values(parentsByPath).map(p => p.id) }, []).catch(console.error)
    return { success: true, id: page.id, linkId: page.linkId }
  })

  app.post<{ Params: { parentPageId: string }, Body?: CreatePageInput }>('/pages/migrate/:parentPageId', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page import must be multipart.')
    const startTime = new Date()
    const ctx = templateRegistry.getCtx(req)
    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const parent = await svcPageInternal.findById(req.params.parentPageId)
    if (!parent) throw new HttpError(404, 'Specified page does not exist.')
    if (!svcPage.mayCreate(parent)) throw new HttpError(403, `Current user is not permitted to import pages beneath ${String(parent.name)}.`)

    const { pageRecord, body } = await handleUpload(req)
    const above = body?.abovePage ? await svcPageInternal.findById(body?.abovePage) : undefined
    if (!body?.migrate) delete pageRecord.data.legacyId
    if (pageRecord.data.legacyId) {
      const [allowed, existing] = await Promise.all([
        ctx.svc(GlobalRuleService).mayOverrideStamps(),
        await svcPageInternal.find({ legacyIds: [pageRecord.data.legacyId] })
      ])
      if (!allowed) throw new HttpError(403, 'You are not permitted to migrate content from another CMS.')
      if (existing.length) throw new HttpError(400, `${pageRecord.name} in ${parent.name}: Another page has legacy id ${pageRecord.data.legacyId}. Use /pages/update/:id instead.`)
    }
    if (body?.publishedAt || body?.publishedBy) {
      if (!pageRecord.data.legacyId) throw new HttpError(400, 'Only pages being imported from another system may override published stamps.')
    }
    const pages = await svcPageInternal.getPageChildren(parent, false)
    const nameSet = new Set(pages.map(p => p.name))
    let newPageName = makeSafe(pageRecord.name)
    while (nameSet.has(newPageName)) newPageName = numerate(newPageName)

    const pagetree = (await ctx.svc(PagetreeServiceInternal).findById(parent.pagetreeId))!
    const site = (await ctx.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const extras = {
      query: systemContext().query,
      siteId: site.id,
      pagetreeId: pagetree.id,
      parentId: parent.id,
      pagePath: `${parent.resolvedPath}/${newPageName}`,
      name: newPageName,
      page: undefined
    }
    const migrated = removeUnreachableComponents(await migratePage(pageRecord.data, extras))
    const response = await svcPage.validatePageData(migrated, extras)
    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    try {
      await svcPage.validatePageTemplates(migrated, { parent })
    } catch (e: any) {
      if (migrated.legacyId) response.addMessage(e.message)
      else throw new HttpError(403, e.message)
    }
    if (!response.success && !migrated.legacyId) throw new HttpError(422, `${response.messages[0].arg ?? ''}: ${response.messages[0].message}`)

    const pageInternalId = await createPage(ctx.svc(VersionedService), user.id, parent, above, newPageName, migrated, {
      ...body,
      ...pick(pageRecord, 'createdBy', 'createdAt', 'modifiedBy', 'modifiedAt', 'linkId')
    })
    const page = (await svcPageInternal.findByInternalId(pageInternalId))!
    logMutation(new Date().getTime() - startTime.getTime(), 'importPage', 'mutation uploadMigratePage (RESTful)', user.id, { parentId: parent.id, name: newPageName }, { success: true, id: page.id }, []).catch(console.error)
    return { success: true, id: page.id, linkId: page.linkId, messages: response.messages }
  })

  async function exportRecursive (ctx: DGContext, push: (obj: any) => Promise<void>, page: Page, pagePath: string, recurse: boolean, counter = { count: 0 }) {
    const data = await ctx.svc(VersionedService).get(page.intDataId)
    if (!data) throw new HttpError(500, `Page ${page.name} is corrupted and cannot be exported.`)
    const pageRecord = {
      name: page.name,
      path: pagePath,
      linkId: page.linkId,
      data: { ...data.data, legacyId: undefined },
      version: data.version,
      createdBy: data.createdBy,
      createdAt: data.created,
      modifiedBy: data.modifiedBy,
      modifiedAt: data.modified
    }
    await push(pageRecord)
    counter.count++
    if (recurse) {
      const children = await ctx.svc(PageService).getPageChildren(page, false, { deleteStates: [DeleteStateInput.NOTDELETED] })
      for (const child of children) await exportRecursive(ctx, push, child, pagePath + '/' + child.name, recurse, counter)
    }
  }

  app.get<{ Params: { id: string }, Querystring: { withSubpages?: boolean } }>('/pages/:id', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    await getEnabledUser(ctx)
    const page = await ctx.svc(PageService).findById(req.params.id)
    if (!page) throw new HttpError(404)

    const recursive = !!req.query.withSubpages

    void res.header('Cache-Control', 'no-cache')
    void res.header('Content-Type', 'application/x-gzip')
    void res.header('Access-Control-Expose-Headers', 'Content-Disposition')
    void res.header('Content-Disposition', 'attachment;filename=' + page.resolvedPath.split('/').filter(isNotBlank).join('.') + (recursive ? '.jsonl.gz' : '.json.gz'))
    const { push, done, output, error } = jsonlGzStream()
    exportRecursive(ctx, push, page, page.resolvedPath, recursive).then(done).catch(error)
    return output
  })
  app.get('/pages/list', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    await getEnabledUser(ctx)
    const sbinds: any[] = []
    const pages = await db.getall<{ id: number, linkId: string, dataId: number, name: string, path: string, title: string, templateKey: string, siteId: number, siteName: string, siteLaunchState: number, pagetreeId: number, deleteState: DeleteState, pagetreeName: string, pagetreeType: PagetreeType, modifiedBy: string, modified: Date, version: number, published: 0 | 1, publishedAt?: Date, hasUnpublishedChanges: boolean }>(`
      SELECT p.*, pt.name AS pagetreeName, pt.type as pagetreeType, st.modifiedBy, st.modified, st.version,
        t.id IS NOT NULL as published, t.date as publishedAt, (t.version IS NULL OR t.version != st.version) as hasUnpublishedChanges,
        s.name as siteName, s.launchEnabled as siteLaunchState
      FROM pages p
      INNER JOIN sites s ON p.siteId = s.id
      INNER JOIN pagetrees pt ON p.pagetreeId = pt.id
      INNER JOIN storage st ON p.dataId = st.id
      LEFT JOIN tags t ON st.id=t.id AND t.tag='published'
      WHERE p.path='/'
        AND p.deleteState IN (0, 1)
        AND s.deletedAt IS NULL
        AND pt.deletedAt IS NULL
        ${ctx.authInfo.pageSiteIds ? `AND s.id IN (${db.in(sbinds, ctx.authInfo.pageSiteIds)})` : ''}
      ORDER BY siteName, p.path, p.name
    `, sbinds)

    const permsByPageInternalId: Record<number, RootPage['permissions'] & { viewForEdit: boolean }> = {}
    function hasPerm (rules: PageRule[], perm: keyof PageRule['grants']) {
      for (const r of rules) {
        if (r.grants[perm]) return true
      }
      return false
    }
    const pagesToKeep: typeof pages = []
    for (const p of pages) {
      const page = new Page(p)
      const applicableToPagetree = ctx.authInfo.pageRules.filter(r => PageRuleService.appliesToPagetree(r, page))
      const applicableRules = applicableToPagetree.filter(r => PageRuleService.appliesToPath(r, '/'))
      const applicableToChildRules = applicableToPagetree.filter(r => PageRuleService.appliesToChildOfPath(r, '/'))
      const [create, update, mayDelete, move, publish, undelete, unpublish, viewForEdit] = [
        hasPerm(applicableRules, 'create'),
        hasPerm(applicableRules, 'update'),
        false,
        false,
        hasPerm(applicableRules, 'publish') && p.deleteState === DeleteState.NOTDELETED,
        false,
        hasPerm(applicableRules, 'unpublish') && !!p.published,
        hasPerm([...applicableRules, ...applicableToChildRules], 'viewForEdit')
      ]
      if (viewForEdit) pagesToKeep.push(p)
      permsByPageInternalId[p.id] = {
        create,
        update,
        delete: mayDelete,
        move,
        publish,
        undelete,
        unpublish,
        viewForEdit
      }
    }

    if (!pagesToKeep.length) return []

    const binds: any[] = []
    const children = await db.getall<{ dataId: number, path: string }>(`SELECT dataId, path FROM pages WHERE path IN (${db.in(binds, pagesToKeep.map(p => '/' + String(p.id)))}) AND deleteState IN (0, 1)`, binds)
    const childrenByPath = groupby(children, 'path')

    const ret: RootPage[] = pagesToKeep.map(p => ({
      id: String(p.dataId),
      linkId: p.linkId,
      name: p.name,
      title: p.title,
      path: '/' + p.name,
      deleteState: DeleteState[p.deleteState],
      hasUnpublishedChanges: p.hasUnpublishedChanges,
      modifiedAt: p.modified.toISOString(),
      modifiedBy: {
        id: p.modifiedBy
      },
      template: {
        key: p.templateKey,
        name: templateRegistry.getPageTemplate(p.templateKey).name
      },
      pagetree: {
        id: String(p.pagetreeId),
        name: p.pagetreeName,
        type: p.pagetreeType.toLocaleUpperCase()
      },
      site: {
        id: String(p.siteId),
        name: p.siteName,
        launchState: LaunchState[p.siteLaunchState]
      },
      published: !!p.published,
      publishedAt: p.publishedAt?.toISOString(),
      children: childrenByPath['/' + String(p.id)]?.map(c => ({ id: String(c.dataId) })) ?? [],
      permissions: permsByPageInternalId[p.id]
    }))
    return ret
  })
}
