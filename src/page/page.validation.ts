import { templateRegistry, ComponentData, PageData } from 'internal'

async function validateRecurse (data: ComponentData, path: string[]) {
  const validator = templateRegistry.get(data.templateKey).validate
  const messages = await validator(data)
  let ret: Record<string, string[]> = {}
  for (const key of Object.keys(messages)) {
    ret[[...path, key].join('.')] = messages[key]
  }
  for (const area of Object.keys(data.areas)) {
    const areaList = data.areas[area]
    for (let i = 0; i < areaList.length; i++) {
      const component = areaList[i]
      ret = { ...ret, ...await validateRecurse(component, [...path, 'areas', area, String(i)]) }
    }
  }
  return ret
}

export async function validatePage (page: PageData) {
  return await validateRecurse(page, [])
}
