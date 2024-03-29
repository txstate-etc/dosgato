import { type ComponentData } from '@dosgato/templating'
import { isNotNull } from 'txstate-utils'

// array of templateKey strings in use on the page
export function collectTemplates (component: ComponentData) {
  return new Set(collectComponents(component).map(c => c.templateKey).filter(isNotNull))
}

// recursive helper function to traverse a hydrated page and return a flat array
// of Component instances including the Page instance, which will be first
export function collectComponents (component: ComponentData) {
  const ret = [component] as ComponentData[]
  for (const areaList of Object.values(component.areas ?? {})) {
    for (const component of areaList) {
      ret.push(...collectComponents(component))
    }
  }
  return ret
}
