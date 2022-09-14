import multipart from '@fastify/multipart'
import { AuthError, Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { createReadStream } from 'fs'
import { mkdir } from 'fs/promises'
import { DateTime } from 'luxon'
import { omit } from 'txstate-utils'
import { AssetService, AssetServiceInternal, handleUpload, FileSystemHandler, UserServiceInternal, VersionedService } from '../internal.js'

async function getEnabledUser (ctx: Context) {
  await ctx.waitForAuth()
  if (!ctx.auth?.sub) throw new AuthError()
  const user = await ctx.svc(UserServiceInternal).findById(ctx.auth.sub)
  if (!user || user.disabled) throw new AuthError()
  return user
}

export async function createAssetRoutes (app: FastifyInstance) {
  await mkdir('/files/tmp', { recursive: true })
  await app.register(multipart)
  app.post('/assets', async (req, res) => {
    const ctx = new Context(req)
    await getEnabledUser(ctx) // throws if not authorized
    const { files, data } = await handleUpload(req)
    const assetService = ctx.svc(AssetService)
    for (const file of files) {
      await assetService.create({ folderId: data.folderId, checksum: file.shasum, ...omit(file, 'shasum') })
    }
    return files
  })
  app.get<{ Params: { assetid: string, resizeid: string, filename: string } }>('/resize/:resizeid/:filename', async (req, res) => {
    const ctx = new Context(req)
    const resize = await ctx.svc(AssetService).getResize(req.params.resizeid)
    if (!resize) throw new HttpError(404)

    const etag = req.headers['if-none-match']
    const resizeEtag = `"${resize.checksum}"`
    if (etag && resizeEtag === etag) return await res.status(304).send()

    const filepath = FileSystemHandler.getFileLocation(resize.checksum)

    void res.header('Content-Type', resize.mime)
    void res.header('Content-Disposition', 'inline')
    void res.header('Content-Length', resize.size)
    void res.header('ETag', resizeEtag)
    void res.header('Cache-Control', `public, max-age=${String(60 * 60 * 24 * 30)}`)

    return await res.status(200).send(createReadStream(filepath))
  })
  app.get<{ Params: { id: string, filename: string } }>('/assets/:id/:filename', async (req, res) => {
    const ctx = new Context(req)
    const asset = await ctx.svc(AssetServiceInternal).findById(req.params.id)
    if (!asset) throw new HttpError(404)

    const etag = req.headers['if-none-match']
    const assetEtag = `"${asset.checksum}"`
    if (etag && assetEtag === etag) return await res.status(304).send()

    const data = await ctx.svc(VersionedService).get(asset.dataId)
    const modifiedAt = DateTime.fromJSDate(data!.modified)
    const ifsince = req.headers['if-modified-since'] ? DateTime.fromHTTP(req.headers['if-modified-since']) : undefined
    if (ifsince?.isValid && modifiedAt <= ifsince) return await res.status(304).send()

    const filepath = FileSystemHandler.getFileLocation(asset?.checksum)
    const filename = req.params.filename

    void res.header('Last-Modified', modifiedAt.toHTTP())
    void res.header('ETag', assetEtag)
    void res.header('Cache-Control', 'no-cache')
    void res.header('Content-Type', asset.mime)
    void res.header('Content-Disposition', 'attachment;filename=' + filename)
    void res.header('Content-Length', asset.size)

    return await res.status(200).send(createReadStream(filepath))
  })
}
