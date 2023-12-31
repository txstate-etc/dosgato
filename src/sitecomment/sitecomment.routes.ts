import type { FastifyInstance } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { isBlank } from 'txstate-utils'
import { GlobalRuleService, SiteService, SiteServiceInternal, createSiteComments, getEnabledUser, templateRegistry } from '../internal.js'

export async function createCommentRoutes (app: FastifyInstance) {
  app.post<{ Params: { siteId: string }, Body?: { comment: string, login: string, date: string }[] }>('/site/:siteId/comments', async req => {
    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const site = await ctx.svc(SiteServiceInternal).findById(req.params.siteId)
    if (!site) throw new HttpError(404)
    if (!ctx.svc(SiteService).mayManageGovernance(site) || !ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403)
    if (!req.body?.length) throw new HttpError(400)
    for (const c of req.body) if (isBlank(c.comment) || c.date == null || isBlank(c.login)) throw new HttpError(422, 'Comment, date, and login are required.')
    await createSiteComments(site.id, req.body, user)
  })
}
