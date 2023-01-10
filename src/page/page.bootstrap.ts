import { MockContext } from '@txstate-mws/graphql-server'
import { readdir, readFile } from 'fs/promises'
import { createReadStream } from 'fs'
import { rescue, sortby } from 'txstate-utils'
import { SiteService, PageExport, PageService, PageServiceInternal, createAsset, placeFile, resizeLimiter, AssetService, VersionedService, AssetFolderServiceInternal, fileHandler } from '../internal.js'
import { lookup } from 'mime-types'

async function gatherFiles (path: string) {
  const files = (await rescue(readdir(path, { withFileTypes: true }))) ?? []
  const ret: { fpath: string, name: string }[] = []
  for (const file of files) {
    const fpath = `${path}/${file.name}`
    if (file.isDirectory()) ret.push(...await gatherFiles(fpath))
    else ret.push({ fpath, name: file.name })
  }
  return ret
}

export async function bootstrap () {
  const files = await gatherFiles('/bootstrap')
  for (const file of sortby(files, ({ name }) => name.split('.').slice(0, -1).join('.'))) {
    try {
      const ctx = new MockContext({ sub: 'su01' })
      if (file.name.endsWith('.json')) {
        const path = file.name.split('.').slice(0, -1)
        const pageRecord: PageExport = JSON.parse(await readFile(file.fpath, { encoding: 'utf8' }))

        if (path.length === 1) {
          const resp = await ctx.svc(SiteService).create(path[0], pageRecord.data)
          if (!resp.success) throw new Error(resp.messages[0]?.message)
        } else {
          const parentPath = `/${path.slice(0, -1).join('/')}`
          const name = path[path.length - 1]
          const [parent] = await ctx.svc(PageServiceInternal).find({ paths: [parentPath] })
          const resp = await ctx.svc(PageService).createPage(name, pageRecord.data, parent.id, undefined, undefined, { linkId: pageRecord.linkId })
          if (!resp.success) throw new Error(resp.messages[0]?.message)
        }
      } else if (!file.name.startsWith('.')) {
        const path = file.name.split('.').slice(0, -1)

        if (path.length === 1) throw new Error('Cannot create files in the asset root.')

        const parentPath = `/${path.slice(0, -1).join('/')}`
        const name = path[path.length - 1]
        const [folder] = await ctx.svc(AssetFolderServiceInternal).find({ paths: [parentPath] })

        const stream = createReadStream(file.fpath)
        const info = await placeFile(stream, name, lookup(file.fpath) || 'application/octet-stream')

        const asset = await createAsset(ctx.svc(VersionedService), 'su01', {
          ...info,
          folderId: folder.id
        })
        if (!asset) throw new Error(`Unable to bootstrap asset ${file.name}.`)
        resizeLimiter(async () => await ctx.svc(AssetService).createResizes(asset)).catch(console.error)
      }
    } catch (e: any) {
      console.error(e)
    }
  }
}
