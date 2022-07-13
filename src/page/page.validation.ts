import { ComponentData, ComponentExtras, PageData, PageExtras } from '@dosgato/templating'
import { templateRegistry } from '../internal.js'

async function validateRecurse (extras: ComponentExtras, data: ComponentData, path: string[]) {
  const validator = templateRegistry.getComponentTemplate(data.templateKey)?.validate
  const messages = (await validator?.(data, extras)) ?? []
  for (const area of Object.keys(data.areas ?? {})) {
    const areaList = data.areas![area]
    for (let i = 0; i < areaList.length; i++) {
      const component = areaList[i]
      const subpath = [...path, 'areas', area, String(i)]
      messages.push(...await validateRecurse({ ...extras, path: subpath.join('.') }, component, subpath))
    }
  }
  return messages
}

export async function validatePage (page: PageData, extras: PageExtras) {
  const tmpl = templateRegistry.getPageTemplate(page.templateKey)
  const messages = (await tmpl.validate?.(page, extras)) ?? []
  for (const area of Object.keys(page.areas ?? {})) {
    const areaList = page.areas![area]
    for (let i = 0; i < areaList.length; i++) {
      const component = areaList[i]
      const path = ['areas', area, String(i)]
      messages.push(...await validateRecurse({ ...extras, page, path: path.join('.') }, component, path))
    }
  }
  return messages
}
