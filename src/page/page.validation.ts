import { ComponentData, PageRecord } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { templateRegistry } from '../internal.js'

async function validateRecurse (ctx: Context, page: PageRecord, data: ComponentData, path: string[]) {
  const validator = templateRegistry.getPageOrComponentTemplate(data.templateKey).validate
  const messages = (await validator?.(data, ctx.query, page, path.join('.'))) ?? []
  for (const area of Object.keys(data.areas ?? {})) {
    const areaList = data.areas![area]
    for (let i = 0; i < areaList.length; i++) {
      const component = areaList[i]
      messages.push(...await validateRecurse(ctx, page, component, [...path, 'areas', area, String(i)]))
    }
  }
  return messages
}

export async function validatePage (ctx: Context, page: PageRecord) {
  return await validateRecurse(ctx, page, page.data, [])
}
