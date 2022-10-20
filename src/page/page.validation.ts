import { ComponentData, ComponentExtras, PageData, PageExtras } from '@dosgato/templating'
import { templateRegistry } from '../internal.js'

async function validateRecurse (extras: ComponentExtras, data: ComponentData, path: string[]) {
  if (!data.templateKey) throw new Error(`Encountered a component without a templateKey at ${path.join('.')}`)
  const validator = templateRegistry.getComponentTemplate(data.templateKey)?.validate
  const messages = (await validator?.(data, extras)) ?? []
  for (const area of Object.keys(data.areas ?? {})) {
    const areaList = data.areas![area]
    if (areaList == null) continue
    if (!Array.isArray(areaList)) throw new Error(`Encountered a non-array in area ${[...path, 'areas', area].join('.')}. That is not valid data.`)
    for (let i = 0; i < areaList.length; i++) {
      const subpath = [...path, 'areas', area, String(i)]
      const component = areaList[i]
      if (!component) throw new Error(`Encountered an undefined component at ${subpath.join('.')}`)
      messages.push(...await validateRecurse({ ...extras, path: subpath.join('.') }, component, subpath))
    }
  }
  return messages
}

export async function validatePage (page: PageData, extras: PageExtras) {
  const tmpl = templateRegistry.getPageTemplate(page.templateKey)
  if (!tmpl) throw new Error('Page data did not contain a templateKey.')
  const messages = (await tmpl.validate?.(page, extras)) ?? []
  for (const area of Object.keys(page.areas ?? {})) {
    const areaList = page.areas![area]
    if (areaList == null) continue
    if (!Array.isArray(areaList)) throw new Error(`Encountered a non-array in area ${['areas', area].join('.')}. That is not valid data.`)
    for (let i = 0; i < areaList.length; i++) {
      const component = areaList[i]
      const path = ['areas', area, String(i)]
      if (!component) throw new Error(`Encountered an undefined component at ${path.join('.')}`)
      messages.push(...await validateRecurse({ ...extras, page, path: path.join('.') }, component, path))
    }
  }
  return messages
}
