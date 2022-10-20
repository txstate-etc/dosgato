import { PageData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { HttpError } from 'fastify-txstate'
import db from 'mysql2-async/db'
import { isNotBlank, pick } from 'txstate-utils'
import {
  createPage, CreatePageInput, getEnabledUser, getPageIndexes, GlobalRuleService,
  numerate, PageService, PageServiceInternal, PagetreeServiceInternal,
  SiteServiceInternal, UpdatePageInput, VersionedService
} from '../internal.js'

export interface PageExport {
  name: string
  linkId: string
  data: PageData & { legacyId?: string }
  version: number
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
}

async function handleUpload (req: FastifyRequest) {
  const file = await req.file()
  if (!file) throw new HttpError(400, 'Must upload a file to import.')
  if (file.mimetype !== 'application/json') throw new HttpError(400, 'Import files must be in JSON format.')
  let pageRecord: PageExport
  try {
    pageRecord = JSON.parse((await file.toBuffer()).toString('utf8'))
    if (!pageRecord.name || !pageRecord.linkId || !pageRecord.data.templateKey) throw new Error('not export file')
  } catch (e: any) {
    throw new HttpError(400, 'Uploaded JSON file was not a Dos Gato export file.')
  }
  return pageRecord
}

export async function createPageRoutes (app: FastifyInstance) {
  // skipping this because asset.routes.ts does it
  // await app.register(multipart)

  app.post<{ Params: { parentPageId: string }, Body?: CreatePageInput }>('/pages/:parentPageId', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page import must be multipart.')

    const ctx = new Context(req)
    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const parent = await svcPageInternal.findById(req.params.parentPageId)
    if (!parent) throw new HttpError(404, 'Specified page does not exist.')
    const above = req.body?.abovePage ? await svcPageInternal.findById(req.body?.abovePage) : undefined

    if (!(await svcPage.mayCreate(parent))) throw new HttpError(403, `Current user is not permitted to import pages beneath ${String(parent.name)}.`)

    const pageRecord = await handleUpload(req)
    if (!req.body?.migrate) delete pageRecord.data.legacyId
    if (pageRecord.data.legacyId) {
      const [allowed, existing] = await Promise.all([
        ctx.svc(GlobalRuleService).mayOverrideStamps(),
        await svcPageInternal.find({ legacyIds: [pageRecord.data.legacyId] })
      ])
      if (!allowed) throw new HttpError(403, 'You are not permitted to migrate content from another CMS.')
      if (existing.length) throw new HttpError(400, 'Another page has that legacy id. Use /pages/update/:id instead.')
    }
    if (req.body?.publishedAt || req.body?.publishedBy) {
      if (!pageRecord.data.legacyId) throw new HttpError(400, 'Only pages being imported from another system may override published stamps.')
    }
    const pages = await svcPageInternal.getPageChildren(parent, false)
    const nameSet = new Set(pages.map(p => p.name))
    let newPageName = pageRecord.name
    while (nameSet.has(newPageName)) newPageName = numerate(newPageName)

    // at the time of writing this comment, template usage is approved for an entire pagetree, so
    // it should be safe to simply check if the targeted parent/sibling is allowed to use this template
    try {
      await svcPage.validatePageTemplates(parent, pageRecord.data, true)
    } catch (e: any) {
      throw new HttpError(403, e.message)
    }
    const pagetree = (await ctx.svc(PagetreeServiceInternal).findById(parent.pagetreeId))!
    const site = (await ctx.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const response = await svcPage.validatePageData(pageRecord.data, site, pagetree, parent, pageRecord.name)
    if (!response.success) throw new HttpError(422, 'Exported page data does not validate.')

    const page = await createPage(ctx.svc(VersionedService), user.id, parent, above, pageRecord.name, pageRecord.data, {
      ...req.body,
      ...pick(pageRecord, 'createdBy', 'createdAt', 'modifiedBy', 'modifiedAt', 'linkId')
    })
    return { id: page.id, linkId: page.linkId }
  })
  app.post<{ Params: { assetid: string }, Body?: UpdatePageInput }>('/pages/update/:pageid', async (req, res) => {
    if (!req.isMultipart()) throw new HttpError(400, 'Page update from export file must be multipart.')

    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized

    const svcPageInternal = ctx.svc(PageServiceInternal)
    const svcPage = ctx.svc(PageService)
    const versionedService = ctx.svc(VersionedService)

    const page = await svcPageInternal.findById(req.params.assetid)
    if (!page) throw new HttpError(404, 'Specified page does not exist.')
    if (!(await svcPage.mayUpdate(page))) throw new HttpError(403, `You are not permitted to update page ${String(page.name)}.`)
    const pageRecord = await handleUpload(req)
    if (!req.body?.migrate) delete pageRecord.data.legacyId
    if (pageRecord.data.legacyId) {
      const allowed = await ctx.svc(GlobalRuleService).mayOverrideStamps()
      if (!allowed) throw new HttpError(403, 'You are not permitted to migrate content from another CMS.')
    }
    if (req.body?.publishedAt || req.body?.publishedBy) {
      if (!pageRecord.data.legacyId) throw new HttpError(400, 'Only pages being imported from another system may override published stamps.')
    }
    try {
      await svcPage.validatePageTemplates(page, pageRecord.data, true)
    } catch (e: any) {
      throw new HttpError(403, e.message)
    }
    const pagetree = (await ctx.svc(PagetreeServiceInternal).findById(page.pagetreeId))!
    const site = (await ctx.svc(SiteServiceInternal).findById(pagetree.siteId))!
    const response = await svcPage.validatePageData(pageRecord.data, site, pagetree, page, pageRecord.name)
    if (!response.success) throw new HttpError(422, 'Exported page data does not validate.')

    const indexes = getPageIndexes(pageRecord.data)
    if (pageRecord.data.legacyId) indexes.push({ name: 'legacyId', values: [pageRecord.data.legacyId] })
    const modifiedBy = pageRecord.data.legacyId ? (pageRecord.modifiedBy || user.id) : user.id // || is intended - to catch blanks
    const modifiedAt = pageRecord.data.legacyId ? pageRecord.modifiedAt ? new Date(pageRecord.modifiedAt) : undefined : undefined
    await db.transaction(async db => {
      await versionedService.update(page.dataId, pageRecord.data, indexes, { user: modifiedBy, date: modifiedAt }, db)
      if (pageRecord.data.legacyId && req.body?.publishedAt) await versionedService.tag(page.dataId, 'published', undefined, req.body.publishedBy ?? modifiedBy, new Date(req.body.publishedAt), db)
    })

    return 'Success.'
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
