import { PageData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { HttpError } from 'fastify-txstate'
import db from 'mysql2-async/db'
import { isNotBlank, pick } from 'txstate-utils'
import {
  createPage, CreatePageInput, createPagetree, createSite, getEnabledUser, getPageIndexes, GlobalRuleService,
  logMutation,
  makeSafe, numerate, PageService, PageServiceInternal, PagetreeServiceInternal,
  SiteService, SiteServiceInternal, VersionedService
} from '../internal.js'

export interface PageExport {
  name: string
  linkId: string
  data: PageData & { legacyId?: string }
  version: number
  createdBy?: string
  createdAt?: string
  modifiedBy?: string
  modifiedAt?: string
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

export async function createPageRoutes (app: FastifyInstance) {
  app.post('/pages/site', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Site import must be multipart.')

    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const siteService = ctx.svc(SiteService)
    const siteServiceInternal = ctx.svc(SiteServiceInternal)
    if (!await siteService.mayCreate() || !await ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not permitted to create new sites by importing a file.')
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

    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const siteServiceInternal = ctx.svc(SiteServiceInternal)
    const site = await siteServiceInternal.findById(req.params.siteId)
    if (!site) throw new HttpError(404, 'Site could not be found.')
    if (!await ctx.svc(SiteService).mayManageState(site) || !await ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not permitted to create new pagetrees by importing a file.')
    const { pageRecord, body } = await handleUpload(req)
    if (!pageRecord.data.legacyId) throw new HttpError(400, 'The pagetree import endpoint is only meant for migrating from another CMS.')
    const [existingPage] = await ctx.svc(PageServiceInternal).find({ legacyIds: [pageRecord.data.legacyId] })
    if (existingPage) throw new HttpError(400, 'Another page has that legacy id. Use /pages/update/:id instead.')
    const pagetree = await createPagetree(ctx.svc(VersionedService), user, site, pageRecord.data, { ...pick(pageRecord, 'linkId', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'), publishedAt: body?.publishedAt, publishedBy: body?.publishedBy })
    return { id: pagetree.id, name: pagetree.name }
  })

  app.post<{ Params: { pageid: string } }>('/pages/update/:pageid', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page update from export file must be multipart.')

    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized

    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const versionedService = ctx.svc(VersionedService)

    const page = await svcPageInternal.findById(req.params.pageid)
    if (!page) throw new HttpError(404, 'Specified page does not exist.')
    if (!(await svcPage.mayUpdate(page))) throw new HttpError(403, `You are not permitted to update page ${String(page.name)}.`)
    const { pageRecord, body } = await handleUpload(req)
    if (!body?.migrate) delete pageRecord.data.legacyId
    if (pageRecord.data.legacyId) {
      const allowed = await ctx.svc(GlobalRuleService).mayOverrideStamps()
      if (!allowed) throw new HttpError(403, 'You are not permitted to migrate content from another CMS.')
    }
    if (body?.publishedAt || body?.publishedBy) {
      if (!pageRecord.data.legacyId) throw new HttpError(400, 'Only pages being imported from another system may override published stamps.')
    }
    try {
      await svcPage.validatePageTemplates(pageRecord.data, { page })
    } catch (e: any) {
      throw new HttpError(403, e.message)
    }
    const pagetree = (await ctx.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await ctx.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const response = await svcPage.validatePageData(pageRecord.data, site, pagetree, page, pageRecord.name)
    if (!response.success && !pageRecord.data.legacyId) throw new HttpError(422, `${response.messages[0].arg ?? ''}: ${response.messages[0].message}`)

    const indexes = getPageIndexes(pageRecord.data)
    const modifiedBy = pageRecord.data.legacyId && isNotBlank(pageRecord.modifiedBy) ? pageRecord.modifiedBy : user.id
    const modifiedAt = pageRecord.data.legacyId && isNotBlank(pageRecord.modifiedAt) ? new Date(pageRecord.modifiedAt) : undefined
    const publishedAt = isNotBlank(body?.publishedAt) ? new Date(body.publishedAt) : undefined
    await db.transaction(async db => {
      await versionedService.update(page.dataId, pageRecord.data, indexes, { user: modifiedBy, date: modifiedAt }, db)
      if (publishedAt && modifiedAt && publishedAt >= modifiedAt) await versionedService.tag(page.dataId, 'published', undefined, body.publishedBy ?? modifiedBy, publishedAt, db)
      await db.update('UPDATE pages SET title=?, templateKey=? WHERE dataId=?', [pageRecord.data.title, pageRecord.data.templateKey, page.dataId])
    }, { retries: 2 })

    return { id: page.id, linkId: page.linkId, messages: response.messages }
  })

  app.post<{ Params: { parentPageId: string }, Body?: CreatePageInput }>('/pages/:parentPageId', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page import must be multipart.')
    const startTime = new Date()
    const ctx = new Context(req)
    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const user = await getEnabledUser(ctx) // throws if not authenticated
    const parent = await svcPageInternal.findById(req.params.parentPageId)
    if (!parent) throw new HttpError(404, 'Specified page does not exist.')
    if (!(await svcPage.mayCreate(parent))) throw new HttpError(403, `Current user is not permitted to import pages beneath ${String(parent.name)}.`)

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
    const response = await svcPage.validatePageData(pageRecord.data, site, pagetree, parent, newPageName)
    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    try {
      await svcPage.validatePageTemplates(pageRecord.data, { parent })
    } catch (e: any) {
      if (pageRecord.data.legacyId) response.addMessage(e.message)
      else throw new HttpError(403, e.message)
    }
    if (!response.success && !pageRecord.data.legacyId) throw new HttpError(422, `${response.messages[0].arg ?? ''}: ${response.messages[0].message}`)

    const page = await createPage(ctx.svc(VersionedService), user.id, parent, above, newPageName, pageRecord.data, {
      ...body,
      ...pick(pageRecord, 'createdBy', 'createdAt', 'modifiedBy', 'modifiedAt', 'linkId')
    })
    logMutation(new Date().getTime() - startTime.getTime(), 'importPage', 'mutation uploadImportPage (RESTful)', user.id, { parentId: parent.id, name: newPageName }, { success: true, id: page.id }, []).catch(console.error)
    return { success: true, id: page.id, linkId: page.linkId, messages: response.messages }
  })

  app.get<{ Params: { id: string } }>('/pages/:id', async (req, res) => {
    const ctx = new Context(req)
    const page = await ctx.svc(PageServiceInternal).findById(req.params.id)
    if (!page) throw new HttpError(404)

    const [path, data] = await Promise.all([
      ctx.svc(PageServiceInternal).getPath(page),
      ctx.svc(VersionedService).get(page.dataId)
    ])

    if (!data) throw new HttpError(500, 'Page found but data was missing.')

    void res.header('Cache-Control', 'no-cache')
    void res.header('Content-Type', 'application/json')
    void res.header('Content-Disposition', 'attachment;filename=' + path.split('/').filter(isNotBlank).join('.') + '.json')
    data.data.legacyId = undefined
    return {
      name: page.name,
      linkId: page.linkId,
      data: data.data,
      version: data.version,
      createdBy: data.createdBy,
      createdAt: data.created,
      modifiedBy: data.modifiedBy,
      modifiedAt: data.modified
    }
  })
}
