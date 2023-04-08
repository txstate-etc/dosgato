import { Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { getEnabledUser } from '../util'
import { GlobalRuleService, SiteService, SiteServiceInternal, createSiteComments } from '../internal'
import { isBlank } from 'txstate-utils'

export async function createCommentRoutes (app: FastifyInstance) {
  app.post<{ Params: { siteId: string }, Body?: { comments: { comment: string, login: string, date: string }[] } }>('/site/:id/comments', async req => {
    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const site = await ctx.svc(SiteServiceInternal).findById(req.params.siteId)
    if (!site) throw new HttpError(404)
    if (!await ctx.svc(SiteService).mayManageGovernance(site) || !await ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403)
    if (!req.body?.comments.length) throw new HttpError(400)
    for (const c of req.body.comments) if (isBlank(c.comment) || c.date == null || isBlank(c.login)) throw new HttpError(422, 'Comment, date, and login are required.')
    await createSiteComments(site.id, req.body.comments, user)
  })
}
