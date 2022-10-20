import { MockContext } from '@txstate-mws/graphql-server'
import { readdir, readFile } from 'fs/promises'
import { rescue, sortby } from 'txstate-utils'
import { SiteService, PageExport, PageService, PageServiceInternal } from '../internal.js'

async function gatherFiles (path: string) {
  const files = (await rescue(readdir(path))) ?? []
  const ret: { fpath: string, name: string }[] = []
  for (const file of files) {
    const fpath = `${path}/${file}`
    if (file.endsWith('.json')) ret.push({ fpath, name: file })
    else ret.push(...await gatherFiles(fpath))
  }
  return ret
}

export async function bootstrap () {
  const files = await gatherFiles('/bootstrap')
  for (const file of sortby(files, ({ name }) => name.split('.').slice(0, -1).join('.'))) {
    try {
      const path = file.name.split('.').slice(0, -1)
      const pageRecord: PageExport = JSON.parse(await readFile(file.fpath, { encoding: 'utf8' }))

      const ctx = new MockContext({ sub: 'su01' })
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
    } catch (e: any) {
      console.error(e)
    }
  }
}
