import multipart from '@fastify/multipart'
import archiver from 'archiver'
import { createHash } from 'crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { HttpError } from 'fastify-txstate'
import { DateTime } from 'luxon'
import { lookup } from 'mime-types'
import db from 'mysql2-async/db'
import probe from 'probe-image-size'
import { type Readable } from 'node:stream'
import { type IncomingMessage } from 'node:http'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { groupby, isBlank, isNotBlank, keyby, randomid } from 'txstate-utils'
import { WASMagic } from 'wasmagic'
import {
  type Asset, AssetFolder, AssetFolderService, AssetFolderServiceInternal, type AssetResize, type AssetRule, AssetRuleService,
  AssetService, AssetServiceInternal, createAsset, DeleteState, fileHandler, getEnabledUser, GlobalRuleService, logMutation,
  makeSafeFilename, PagetreeType, recordDownload, replaceAsset, requestResizes, VersionedService, parsePath, deleteAssets, LaunchState,
  templateRegistry
} from '../internal.js'

interface RootAssetFolder {
  id: string
  linkId: string
  path: string
  name: string
  deleted: boolean
  deleteState: string
  folders: {
    id: string
  }[]
  assets: {
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
    move: boolean
    delete: boolean
    undelete: boolean
  }
}

const magicPromise = WASMagic.create()
export async function placeFile (readStream: Readable, filename: string, mimeGuess: string) {
  const magic = await magicPromise
  const bufs: Buffer[] = []
  let isDetected = false
  let curSize = 0
  let mime = mimeGuess
  readStream.on('data', (chunk: Buffer) => {
    if (!isDetected) {
      bufs.push(chunk)
      curSize += chunk.length
      if (curSize >= 1024) {
        const received = Buffer.concat(bufs)
        mime = magic.detect(received)
        isDetected = mime !== 'application/x-ole-storage' || curSize > 20971520
      }
    }
  })
  readStream.on('close', () => {
    if (!isDetected) {
      const received = Buffer.concat(bufs)
      mime = magic.getMime(received)
    }
  })
  const metadataPromise = probe(readStream, true)
  readStream.on('limit', () => {
    (readStream as any).truncated = true
    readStream.emit('error', new Error('Max file size limit reached.'))
  })
  const { checksum, size } = await fileHandler.put(readStream)
  if (mime.startsWith('plain/text') || mime === 'application/octet-stream') mime = mimeGuess
  // lots of old MS office documents identify as openxml in libmagic but the extension is more reliable
  // e.g. xlsm, xltx
  if (mime.startsWith('application/x-ole-storage') && mimeGuess.startsWith('application/msword')) mime = mimeGuess
  if (mime.startsWith('application/vnd.openxml') && mimeGuess.startsWith('application/vnd.')) mime = mimeGuess

  const name = makeSafeFilename(filename)

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
  return { filename, name, checksum, mime, size, width, height }
}

export async function handleURLUpload (url: string, modifiedAt?: string, auth?: string) {
  const filename = decodeURIComponent(url.split('/').slice(-1)[0] ?? randomid())
  let urlhash: string | undefined
  if (modifiedAt) { // only try to skip download if modifiedAt was included... otherwise we can't determine that the target hasn't changed
    urlhash = createHash('sha1').update(url + modifiedAt).digest('hex')
    const existing = await db.getrow<{ checksum: string, mime: string, size: number, width?: number, height?: number }>('SELECT * FROM migratedurlinfo WHERE urlhash=UNHEX(?)', [urlhash])
    if (existing && await fileHandler.exists(existing.checksum)) {
      console.info('skipping download of', url, 'because it was downloaded in a previous migration.')
      return {
        filename,
        name: makeSafeFilename(filename),
        checksum: existing.checksum,
        mime: existing.mime,
        size: existing.size,
        width: existing.width,
        height: existing.height
      }
    }
  }
  console.info('downloading', url)
  const get = url.startsWith('https:') ? httpsGet : httpGet
  const resp = await new Promise<IncomingMessage>((resolve, reject) => get(url, { headers: { Authorization: auth ?? '' } }, resolve).on('error', reject))
  if ((resp.statusCode ?? 500) >= 400) {
    resp.destroy()
    throw new HttpError(resp.statusCode ?? 500, `Target URL returned status ${resp.statusCode!}`)
  }
  const mimeGuess = resp.headers['content-type'] ?? (lookup(url) || 'application/octet-stream')
  const file = await placeFile(resp, filename, mimeGuess)
  if (urlhash) await db.insert('INSERT INTO migratedurlinfo (urlhash, checksum, mime, size, width, height) VALUES (UNHEX(?), ?, ?, ?, ?, ?) ON DUPLICATE KEY update checksum=checksum', [urlhash, file.checksum, file.mime, file.size, file.width ?? null, file.height ?? null])
  return file
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

function getFolderPath (folder: AssetFolder, foldersByInternalId: Record<string, AssetFolder>): string {
  const parent = foldersByInternalId[folder.parentInternalId!]
  return (parent ? getFolderPath(parent, foldersByInternalId) : '') + '/' + folder.name
}

function safeParse <T = any> (json: string) {
  try {
    return JSON.parse(json) as T
  } catch (e) {
    return undefined
  }
}

export async function createAssetRoutes (app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024 } })
  app.post<{ Params: { folderId: string }, Body?: { url: string, uploadedFilename?: string, markAsDeleted?: boolean, legacyId?: string, auth?: string, modifiedBy?: string, modifiedAt?: string, createdBy?: string, createdAt?: string, linkId?: string, meta?: any } }>(
    '/assets/:folderId', async (req, res) => {
    const startTime = new Date()
    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const folder = await ctx.svc(AssetFolderServiceInternal).findById(req.params.folderId)
    if (!folder) throw new HttpError(404, 'Specified folder does not exist.')
    if (!ctx.svc(AssetFolderService).mayCreate(folder)) throw new HttpError(403, `Current user is not permitted to add assets to folder ${String(folder.name)}.`)
    if (req.body?.createdAt || req.body?.createdBy || req.body?.modifiedAt || req.body?.modifiedBy) {
      if (!req.body.legacyId) throw new HttpError(400, 'Only assets being imported from another system may override created/modified attributes.')
      if (!ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not allowed to set created/modified stamps on new assets.')
    }

    const versionedService = ctx.svc(VersionedService)

    const ids: string[] = []
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
          modifiedAt: data.modifiedAt,
          linkId: data.linkId,
          meta: safeParse(data.meta) ?? {}
        }, { numerate: true })
        ids.push(asset.id)
        await requestResizes(asset)
      }
    } else if (req.body?.url) {
      const file = await handleURLUpload(req.body.url, req.body.modifiedAt, req.body.auth)
      const asset = await createAsset(versionedService, user.id, {
        ...file,
        uploadedFilename: req.body.uploadedFilename,
        legacyId: req.body.legacyId,
        folderId: folder.id,
        createdBy: req.body.createdBy,
        createdAt: req.body.createdAt,
        modifiedBy: req.body.modifiedBy,
        modifiedAt: req.body.modifiedAt,
        linkId: req.body.linkId,
        meta: req.body.meta ?? {}
      }, { numerate: true })
      ids.push(asset.id)
      if (req.body.markAsDeleted) await deleteAssets([asset.internalId], user.internalId)
      await requestResizes(asset)
    } else {
      throw new HttpError(400, 'Asset upload must be multipart or specify a URL to download from.')
    }
    logMutation(new Date().getTime() - startTime.getTime(), 'createAsset', 'mutation uploadCreateAsset (RESTful)', user.id, { folderId: folder.id }, { success: true, ids }, [], ctx).catch(console.error)
    return { success: true, ids }
  })
  app.post<{ Params: { assetid: string }, Body?: { url: string, auth?: string, modifiedBy?: string, modifiedAt?: string } }>(
    '/assets/replace/:assetid', async (req, res) => {
    const startTime = new Date()
    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx) // throws if not authorized
    const asset = await ctx.svc(AssetServiceInternal).findById(req.params.assetid)
    if (!asset) throw new HttpError(404, 'Specified asset does not exist.')
    const assetService = ctx.svc(AssetService)
    const versionedService = ctx.svc(VersionedService)
    if (!assetService.mayUpdate(asset)) throw new HttpError(403, `You are not permitted to update asset ${String(asset.name)}.`)
    if (req.body?.modifiedAt || req.body?.modifiedBy) {
      const data = await versionedService.get(asset.intDataId)
      if (!data?.data.legacyId) throw new HttpError(400, 'Only assets that were imported from another system may override modified attributes.')
      if (!ctx.svc(GlobalRuleService).mayOverrideStamps()) throw new HttpError(403, 'You are not allowed to set modified stamps when updating assets.')
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
        await requestResizes(newAsset)
      }
    } else if (req.body?.url) {
      const file = await handleURLUpload(req.body.url, req.body.modifiedAt, req.body.auth)
      const newAsset = await replaceAsset(versionedService, user.id, {
        ...file,
        assetId: asset.id,
        modifiedBy: req.body.modifiedBy,
        modifiedAt: req.body.modifiedAt
      })
      await requestResizes(newAsset)
    } else {
      throw new HttpError(400, 'Asset upload must be multipart or specify a URL to download from.')
    }
    logMutation(new Date().getTime() - startTime.getTime(), 'replaceAsset', 'mutation uploadReplaceAsset (RESTful)', user.id, { assetid: asset.id }, { success: true }, [], ctx).catch(console.error)
    return { success: true }
  })
  app.get<{ Params: { assetid: string, resizeid: string, filename: string }, Querystring: { admin?: 1 } }>(
    '/assets/:assetid/resize/:resizeid/:filename', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    const [asset, resize] = await Promise.all([
      ctx.svc(AssetServiceInternal).findById(req.params.assetid),
      ctx.svc(AssetService).getResize(req.params.resizeid)
    ])
    if (!asset || !resize) throw new HttpError(404)
    await ctx.waitForAuth()
    if (!ctx.svc(AssetService).mayViewIndividual(asset)) throw new HttpError(404)

    if (!req.query?.admin) recordDownload(resize.checksum)

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
  app.get<{ Params: { assetid: string, width: string, '*': string }, Querystring: { admin?: 1 } }>(
    '/assets/:assetid/w/:width/*', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    const asset = await ctx.svc(AssetServiceInternal).findById(req.params.assetid)
    if (!asset) throw new HttpError(404)
    await ctx.waitForAuth()
    if (!ctx.svc(AssetService).mayViewIndividual(asset)) throw new HttpError(404)
    if (!asset.box) throw new HttpError(400, 'Asset is not an image - width parameter is not supported.')
    const resizes = await ctx.svc(AssetService).getResizes(asset)

    const formats: Record<string, boolean> = {
      ...keyby((req.headers.accept?.split(',') ?? []).map(t => t.split(';')[0])),
      'image/jpeg': true,
      'image/png': true,
      'image/gif': true
    }

    let chosen: Asset | AssetResize = asset
    for (const resize of resizes) {
      if (formats[resize.mime] && (resize.width >= Number(req.params.width) || resize.width === asset.box.width) && resize.size <= chosen.size) chosen = resize
    }

    if (!req.query?.admin) recordDownload(chosen.checksum)

    const etag = req.headers['if-none-match']
    const resizeEtag = `"${chosen.checksum}"`
    if (etag && resizeEtag === etag) return await res.status(304).send()
    const hasChecksum = /^[\w-]{8,}\/.+/.test(req.params['*'])

    void res.header('Content-Type', chosen.mime)
    void res.header('Content-Disposition', 'inline')
    void res.header('Content-Length', chosen.size)
    void res.header('ETag', resizeEtag)
    void res.header('Cache-Control', hasChecksum ? 'max-age=31536000, immutable' : `public, max-age=${String(5 * 60)}`)

    return await res.status(200).send(fileHandler.get(chosen.checksum))
  })
  async function handleLegacy (req: FastifyRequest<{ Params: { id: string, '*'?: string } }>, res: FastifyReply) {
    const ctx = templateRegistry.getCtx(req)
    const [asset] = await ctx.svc(AssetServiceInternal).find({ legacyIds: [req.params.id], pagetreeTypes: [PagetreeType.PRIMARY] })
    if (!asset) throw new HttpError(404)
    await ctx.waitForAuth()
    if (!ctx.svc(AssetService).mayViewIndividual(asset)) throw new HttpError(404)

    const resizes = await ctx.svc(AssetService).getResizes(asset)

    const formats: Record<string, boolean> = {
      ...keyby((req.headers.accept?.split(',') ?? []).map(t => t.split(';')[0])),
      'image/jpeg': true,
      'image/png': true,
      'image/gif': true
    }

    let chosen: Asset | AssetResize = asset
    for (const resize of resizes) {
      const chosenWidth = 'width' in chosen ? chosen.width : (chosen.box?.width ?? 0)
      if (formats[resize.mime] && resize.width >= chosenWidth) chosen = resize
    }

    recordDownload(chosen.checksum)

    const etag = req.headers['if-none-match']
    const assetEtag = `"${chosen.checksum}"`
    if (etag && assetEtag === etag) return await res.status(304).send()

    const data = await ctx.svc(VersionedService).get(asset.intDataId)
    const modifiedAt = DateTime.fromJSDate(data!.modified)
    const ifsince = req.headers['if-modified-since'] ? DateTime.fromHTTP(req.headers['if-modified-since']) : undefined
    if (ifsince?.isValid && modifiedAt <= ifsince) return await res.status(304).send()

    const filename = isBlank(req.params['*']) ? asset.filename : ''

    void res.header('Last-Modified', modifiedAt.toHTTP())
    void res.header('ETag', assetEtag)
    void res.header('Cache-Control', `public, max-age=${String(5 * 60)}`)
    void res.header('Content-Type', chosen.mime)
    void res.header('Content-Disposition', 'attachment;filename=' + filename)
    void res.header('Content-Length', chosen.size)

    return await res.status(200).send(fileHandler.get(chosen.checksum))
  }
  app.get<{ Params: { id: string } }>('/assets/legacy/:id', handleLegacy)
  app.get<{ Params: { id: string, '*': string } }>('/assets/legacy/:id/*', handleLegacy)
  app.get<{ Params: { id: string, '*': string }, Querystring: { admin?: 1 } }>(
    '/assets/:id/*', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    let asset = await ctx.svc(AssetServiceInternal).findById(req.params.id)
    if (!asset) {
      const { path, extension } = parsePath([req.params.id, req.params['*']].filter(isNotBlank).join('/'))
      asset = (await ctx.svc(AssetServiceInternal).find({ paths: extension ? [path, `${path}.${extension}`] : [path] }))[0]
    }
    if (!asset) throw new HttpError(404)
    await ctx.waitForAuth()
    if (!ctx.svc(AssetService).mayViewIndividual(asset)) throw new HttpError(404)

    if (!req.query?.admin) recordDownload(asset.checksum)

    const etag = req.headers['if-none-match']
    const assetEtag = `"${asset.checksum}"`
    if (etag && assetEtag === etag) return await res.status(304).send()

    const data = await ctx.svc(VersionedService).get(asset.intDataId)
    const modifiedAt = DateTime.fromJSDate(data!.modified)
    const ifsince = req.headers['if-modified-since'] ? DateTime.fromHTTP(req.headers['if-modified-since']) : undefined
    if (ifsince?.isValid && modifiedAt <= ifsince) return await res.status(304).send()

    const filename = isBlank(req.params['*']) ? asset.filename : ''

    void res.header('Last-Modified', modifiedAt.toHTTP())
    void res.header('ETag', assetEtag)
    void res.header('Cache-Control', `public, max-age=${String(5 * 60)}`)
    void res.header('Content-Type', asset.mime)
    void res.header('Content-Disposition', 'attachment;filename=' + filename)
    void res.header('Content-Length', asset.size)

    return await res.status(200).send(fileHandler.get(asset.checksum))
  })
  app.get<{ Params: { folderId: string, folderName: string } }>('/assets/zip/:folderId/:folderName.zip', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    const folder = await ctx.svc(AssetFolderServiceInternal).findById(req.params.folderId)
    if (!folder) throw new HttpError(404)
    await ctx.waitForAuth()
    if (!ctx.svc(AssetFolderService).mayViewIndividual(folder)) throw new HttpError(404)

    const [folders, folderPath] = await Promise.all([
      ctx.svc(AssetFolderServiceInternal).getChildFolders(folder, true),
      ctx.svc(AssetFolderServiceInternal).getPath(folder)
    ])
    const foldersByInternalId = keyby([folder, ...folders], 'internalId')
    const assets = await ctx.svc(AssetServiceInternal).findByFolders([...folders, folder])

    const archive = archiver('zip')
    void res.header('Content-Type', 'application/zip')
    void res.header('Content-Disposition', 'attachment;filename=' + folderPath.substring(1).replace(/\//g, '.') + '.zip')
    void res.send(archive)
    const prefix = folderPath.substring(1).split('/').slice(0, -1).join('.')
    for (const asset of assets) {
      archive.append(fileHandler.get(asset.checksum), { name: (prefix ? prefix + '.' : '') + getFolderPath(foldersByInternalId[asset.folderInternalId], foldersByInternalId).substring(1) + '/' + asset.filename })
    }
    await archive.finalize()
  })
  app.get('/assetfolders/list', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    await getEnabledUser(ctx)
    const folders = await db.getall<{ id: number, linkId: string, name: string, path: string, deleteState: DeleteState, siteId: number, siteName: string, launchEnabled: LaunchState, pagetreeId: number, pagetreeName: string, pagetreeType: PagetreeType }>(`
      SELECT f.*, pt.name AS pagetreeName, pt.type as pagetreeType, s.name as siteName, s.launchEnabled as launchEnabled
      FROM assetfolders f
      INNER JOIN sites s ON f.siteId = s.id
      INNER JOIN pagetrees pt ON f.pagetreeId = pt.id
      WHERE f.path='/'
        AND f.deleteState IN (0, 1)
        AND s.deletedAt IS NULL
        AND pt.deletedAt IS NULL
      ORDER BY f.name
    `)

    const permsByInternalId: Record<number, RootAssetFolder['permissions']> = {}
    function hasPerm (rules: AssetRule[], perm: keyof AssetRule['grants']) {
      for (const r of rules) {
        if (r.grants[perm]) return true
      }
      return false
    }
    const foldersToKeep: typeof folders = []
    for (const f of folders) {
      const folder = new AssetFolder(f)
      const applicableToPagetree = ctx.authInfo.assetRules.filter(r => AssetRuleService.appliesToPagetree(r, folder))
      const applicableRules = applicableToPagetree.filter(r => AssetRuleService.appliesToPath(r, '/'))
      const applicableToChildRules = applicableToPagetree.filter(r => AssetRuleService.appliesToChildOfPath(r, '/'))
      const [create, update, mayDelete, move, undelete, viewForEdit] = [
        hasPerm(applicableRules, 'create'),
        hasPerm(applicableRules, 'update'),
        false,
        false,
        false,
        hasPerm([...applicableRules, ...applicableToChildRules], 'viewForEdit')
      ]
      if (viewForEdit) foldersToKeep.push(f)
      permsByInternalId[f.id] = {
        create,
        update,
        delete: mayDelete,
        move,
        undelete
      }
    }

    if (!foldersToKeep.length) return []

    const binds1: any[] = []
    const binds2: any[] = []
    const [childFolders, childAssets] = await Promise.all([
      db.getall<{ id: number, path: string }>(`SELECT id, path FROM assetfolders WHERE path IN (${db.in(binds1, foldersToKeep.map(f => '/' + String(f.id)))}) AND deleteState IN (0, 1)`, binds1),
      db.getall<{ dataId: number, folderId: number }>(`SELECT dataId, folderId FROM assets WHERE folderId IN (${db.in(binds2, foldersToKeep.map(f => f.id))}) AND deleteState IN (0, 1)`, binds2)
    ])
    const childFoldersByPath = groupby(childFolders, 'path')
    const childAssetsById = groupby(childAssets, 'folderId')

    const ret: RootAssetFolder[] = foldersToKeep.map(f => ({
      id: String(f.id),
      linkId: f.linkId,
      name: f.name,
      path: '/' + f.name,
      deleted: f.deleteState !== DeleteState.NOTDELETED,
      deleteState: DeleteState[f.deleteState],
      pagetree: {
        id: String(f.pagetreeId),
        name: f.pagetreeName,
        type: f.pagetreeType.toLocaleUpperCase()
      },
      site: {
        id: String(f.siteId),
        name: f.siteName,
        launchState: LaunchState[f.launchEnabled]
      },
      folders: childFoldersByPath['/' + String(f.id)]?.map(f => ({ id: String(f.id) })) ?? [],
      assets: childAssetsById[f.id]?.map(a => ({ id: String(a.dataId) })) ?? [],
      permissions: permsByInternalId[f.id]
    }))
    return ret
  })
}
