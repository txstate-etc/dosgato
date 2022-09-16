import multipart from '@fastify/multipart'
import { AuthError, Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance } from 'fastify'
import { FastifyRequest } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { fileTypeStream } from 'file-type'
import { DateTime } from 'luxon'
import { lookup } from 'mime-types'
import probe from 'probe-image-size'
import { PassThrough } from 'stream'
import { pLimit } from 'txstate-utils'
import {
  AssetFolderService, AssetFolderServiceInternal, AssetService, AssetServiceInternal, createAsset, fileHandler,
  makeSafe, UserServiceInternal, VersionedService
} from '../internal.js'

const resizeLimiter = pLimit(2)

export async function handleUpload (req: FastifyRequest) {
  const data: any = {}
  const files = []
  for await (const part of req.parts()) {
    if (part.file) {
      const fileTypePassthru = await fileTypeStream(part.file)
      const probePassthru = new PassThrough()
      const metadataPromise = probe(probePassthru, true)
      const checksum = await fileHandler.put(fileTypePassthru.pipe(probePassthru))
      const { mime } = fileTypePassthru.fileType ?? { ext: lookup(part.mimetype) || '', mime: part.mimetype }

      let name = part.filename
      const extFromFileName = name.match(/\.(\w+)$/)?.[1]
      if (extFromFileName && lookup(extFromFileName)) name = name.replace(new RegExp('\\.' + extFromFileName + '$'), '')
      name = makeSafe(name)

      let metadata: probe.ProbeResult
      let width: number | undefined
      let height: number | undefined
      if (mime.startsWith('image/')) {
        try {
          metadata = await metadataPromise
          width = metadata.width
          height = metadata.height
          if ((metadata.orientation ?? 1) > 4) {
            width = height
            height = metadata.width
          }
        } catch (e) {
          console.warn('Unable to read metadata for image', name, 'of type', mime, e)
        }
      }

      files.push({ name, checksum, mime, size: part.file.bytesRead, width, height })
    } else {
      data[part.fieldname] = (part as any).value
    }
  }
  return { files, data }
}

async function getEnabledUser (ctx: Context) {
  await ctx.waitForAuth()
  if (!ctx.auth?.sub) throw new AuthError()
  const user = await ctx.svc(UserServiceInternal).findById(ctx.auth.sub)
  if (!user || user.disabled) throw new AuthError()
  return user
}

export async function createAssetRoutes (app: FastifyInstance) {
  await fileHandler.init()
  await app.register(multipart)
  app.post<{ Params: { folderId: string } }>('/assets/:folderId', async (req, res) => {
    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const folder = await ctx.svc(AssetFolderServiceInternal).findById(req.params.folderId)
    if (!folder) throw new HttpError(404, 'Specified folder does not exist')
    if (!(await ctx.svc(AssetFolderService).mayCreate(folder))) throw new HttpError(403, `Current user is not permitted to add assets to folder ${String(folder.name)}.`)

    const assetService = ctx.svc(AssetService)
    const versionedService = ctx.svc(VersionedService)

    const { files } = await handleUpload(req)
    for (const file of files) {
      const asset = await createAsset(versionedService, user.id, {
        ...file,
        folderId: folder.id
      })
      resizeLimiter(async () => await assetService.createResizes(asset)).catch(console.error)
    }
    return 'Success.'
  })
  app.get<{ Params: { assetid: string, resizeid: string, filename: string } }>('/resize/:resizeid/:filename', async (req, res) => {
    const ctx = new Context(req)
    const resize = await ctx.svc(AssetService).getResize(req.params.resizeid)
    if (!resize) throw new HttpError(404)

    const etag = req.headers['if-none-match']
    const resizeEtag = `"${resize.checksum}"`
    if (etag && resizeEtag === etag) return await res.status(304).send()

    void res.header('Content-Type', resize.mime)
    void res.header('Content-Disposition', 'inline')
    void res.header('Content-Length', resize.size)
    void res.header('ETag', resizeEtag)
    void res.header('Cache-Control', `public, max-age=${String(60 * 60 * 24 * 30)}`)

    return await res.status(200).send(fileHandler.get(resize.checksum))
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

    const filename = req.params.filename

    void res.header('Last-Modified', modifiedAt.toHTTP())
    void res.header('ETag', assetEtag)
    void res.header('Cache-Control', 'no-cache')
    void res.header('Content-Type', asset.mime)
    void res.header('Content-Disposition', 'attachment;filename=' + filename)
    void res.header('Content-Length', asset.size)

    return await res.status(200).send(fileHandler.get(asset.checksum))
  })
}
