import multipart from '@fastify/multipart'
import { AuthError, Context } from '@txstate-mws/graphql-server'
import type { FastifyInstance } from 'fastify'
import { FastifyRequest } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { fileTypeStream } from 'file-type'
import { DateTime } from 'luxon'
import { lookup } from 'mime-types'
import probe from 'probe-image-size'
import { PassThrough, Readable } from 'stream'
import { ReadableStream } from 'stream/web'
import { keyby, pLimit, randomid } from 'txstate-utils'
import {
  Asset,
  AssetFolderService, AssetFolderServiceInternal, AssetResize, AssetService, AssetServiceInternal, createAsset, fileHandler,
  GlobalRuleService, makeSafe, replaceAsset, UserServiceInternal, VersionedService
} from '../internal.js'

const resizeLimiter = pLimit(2)

export async function placeFile (readStream: Readable, filename: string, mimeGuess: string) {
  const fileTypePassthru = await fileTypeStream(readStream)
  const probePassthru = new PassThrough()
  const metadataPromise = probe(probePassthru, true)
  const { checksum, size } = await fileHandler.put(fileTypePassthru.pipe(probePassthru))
  let { mime } = fileTypePassthru.fileType ?? { mime: mimeGuess }
  if (mime === 'application/x-cfb' || mime.startsWith('plain/text')) mime = mimeGuess // npm file-type library not good at distinguishing old MS Office formats

  let name = filename
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
  return { name, checksum, mime, size, width, height }
}

export async function handleURLUpload (url: string, auth?: string) {
  const resp = await fetch(url, {
    headers: {
      Authorization: auth ?? ''
    }
  })
  if ((resp.status ?? 500) >= 400) throw new HttpError(resp.status ?? 500, `Target URL returned status ${resp.status}`)
  const filename = url.split('/').slice(-1)[0] ?? randomid()
  const mimeGuess = resp.headers.get('content-type') ?? (lookup(url) || 'application/octet-stream')
  const readStream = resp.body
  if (!readStream) throw new Error('Unable to read from given URL.')
  return await placeFile(Readable.fromWeb(readStream as ReadableStream), filename, mimeGuess)
}

export async function handleUpload (req: FastifyRequest, maxFiles = 200) {
  const data: any = {}
  const files = []
  for await (const part of req.parts()) {
    if ('file' in part) {
      if (files.length >= maxFiles) continue
      const file = await placeFile(part.file, part.filename, part.mimetype)
      files.push({ ...file, fieldname: part.fieldname })
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
  app.post<{ Params: { folderId: string }, Body?: { url: string, legacyId?: string, auth?: string, modifiedBy?: string, modifiedAt?: string, createdBy?: string, createdAt?: string } }>('/assets/:folderId', async (req, res) => {
    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const folder = await ctx.svc(AssetFolderServiceInternal).findById(req.params.folderId)
    if (!folder) throw new HttpError(404, 'Specified folder does not exist.')
    if (!(await ctx.svc(AssetFolderService).mayCreate(folder))) throw new HttpError(403, `Current user is not permitted to add assets to folder ${String(folder.name)}.`)
    if (req.body?.legacyId) {
      const asset = (await ctx.svc(AssetServiceInternal).find({ legacyIds: [req.body.legacyId] }))[0]
      if (asset) throw new HttpError(403, 'An asset already exists with the given legacy id. Use /assets/replace/:assetid instead.')
    }
    if (req.body?.createdAt || req.body?.createdBy || req.body?.modifiedAt || req.body?.modifiedBy) {
      if (!req.body.legacyId) throw new HttpError(400, 'Only assets being imported from another system may override created/modified attributes.')
      if (!await ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not allowed to set created/modified stamps on new assets.')
    }

    const assetService = ctx.svc(AssetService)
    const versionedService = ctx.svc(VersionedService)

    if (req.isMultipart()) {
      const { files, data } = await handleUpload(req)
      for (const file of files) {
        const asset = await createAsset(versionedService, user.id, {
          ...file,
          legacyId: data[file.fieldname + '_legacyId'],
          folderId: folder.id,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          modifiedBy: data.modifiedBy,
          modifiedAt: data.modifiedAt
        })
        resizeLimiter(async () => await assetService.createResizes(asset)).catch(console.error)
      }
    } else if (req.body?.url) {
      const file = await handleURLUpload(req.body.url, req.body.auth)
      const asset = await createAsset(versionedService, user.id, {
        ...file,
        legacyId: req.body.legacyId,
        folderId: folder.id,
        createdBy: req.body.createdBy,
        createdAt: req.body.createdAt,
        modifiedBy: req.body.modifiedBy,
        modifiedAt: req.body.modifiedAt
      })
      resizeLimiter(async () => await assetService.createResizes(asset)).catch(console.error)
    } else {
      throw new HttpError(400, 'Asset upload must be multipart or specify a URL to download from.')
    }
    return 'Success.'
  })
  app.post<{ Params: { assetid: string }, Body?: { url: string, auth?: string, modifiedBy?: string, modifiedAt?: string } }>('/assets/replace/:assetid', async (req, res) => {
    const ctx = new Context(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const asset = await ctx.svc(AssetServiceInternal).findById(req.params.assetid)
    if (!asset) throw new HttpError(404, 'Specified asset does not exist.')
    const assetService = ctx.svc(AssetService)
    const versionedService = ctx.svc(VersionedService)
    if (!(await assetService.mayUpdate(asset))) throw new HttpError(403, `You are not permitted to update asset ${String(asset.name)}.`)
    if (req.body?.modifiedAt || req.body?.modifiedBy) {
      const data = await versionedService.get(asset.dataId)
      if (!data?.data.legacyId) throw new HttpError(400, 'Only assets that were imported from another system may override modified attributes.')
      if (!await ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not allowed to set modified stamps when updating assets.')
    }

    if (req.isMultipart()) {
      const { files } = await handleUpload(req, 1)
      for (const file of files) {
        const newAsset = await replaceAsset(versionedService, user.id, {
          ...file,
          assetId: asset.id,
          modifiedBy: req.body?.modifiedBy,
          modifiedAt: req.body?.modifiedAt
        })
        ctx.loaders.clear()
        resizeLimiter(async () => await assetService.createResizes(newAsset)).catch(console.error)
      }
    } else if (req.body?.url) {
      const file = await handleURLUpload(req.body.url, req.body.auth)
      const newAsset = await replaceAsset(versionedService, user.id, {
        ...file,
        assetId: asset.id,
        modifiedBy: req.body.modifiedBy,
        modifiedAt: req.body.modifiedAt
      })
      resizeLimiter(async () => await assetService.createResizes(newAsset)).catch(console.error)
    } else {
      throw new HttpError(400, 'Asset upload must be multipart or specify a URL to download from.')
    }
    return 'Success.'
  })
  app.get<{ Params: { resizeid: string, filename: string } }>('/resize/:resizeid/:filename', async (req, res) => {
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
  app.get<{ Params: { assetid: string, width: string, filename: string } }>('/assets/:assetid/w/:width/*', async (req, res) => {
    const ctx = new Context(req)
    const asset = await ctx.svc(AssetServiceInternal).findById(req.params.assetid)
    if (!asset) throw new HttpError(404)
    if (!asset.box) throw new HttpError(400, 'Asset is not an image - width parameter is not supported.')
    const resizes = await ctx.svc(AssetService).getResizes(asset)

    const formats = keyby((req.headers.accept?.split(',') ?? []).map(t => t.split(';')[0]))

    let chosen: Asset | AssetResize = asset
    for (const resize of resizes) {
      if (formats[resize.mime] && (resize.width >= Number(req.params.width) || resize.width === asset.box.width) && resize.size <= chosen.size) chosen = resize
    }

    const etag = req.headers['if-none-match']
    const resizeEtag = `"${chosen.checksum}"`
    if (etag && resizeEtag === etag) return await res.status(304).send()

    void res.header('Content-Type', chosen.mime)
    void res.header('Content-Disposition', 'inline')
    void res.header('Content-Length', chosen.size)
    void res.header('ETag', resizeEtag)
    void res.header('Cache-Control', `public, max-age=${String(60 * 60)}`)

    return await res.status(200).send(fileHandler.get(chosen.checksum))
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
