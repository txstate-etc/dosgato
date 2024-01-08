import type { FastifyInstance } from 'fastify'
import { isNotNull, pick } from 'txstate-utils'
import { getEnabledUser, templateRegistry } from '../internal.js'

export async function createUserRoutes (app: FastifyInstance) {
  app.get<{ Querystring: { q: string } }>('/users/external', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    await getEnabledUser(ctx)
    const q = req.query.q
    const users = templateRegistry.serverConfig.userSearch
      ? (await templateRegistry.serverConfig.userSearch(q)) ?? []
      : templateRegistry.serverConfig.userLookup
        ? Object.values(await templateRegistry.serverConfig.userLookup?.([q])).filter(isNotNull)
        : []
    return users.filter(u => u.enabled).map(u => pick(u, 'login', 'firstname', 'lastname', 'email'))
  })
}
