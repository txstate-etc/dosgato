import { type ComponentData } from '@dosgato/templating'
import { isNotNull } from 'txstate-utils'
import { templateRegistry } from '../internal.js'

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

/**
 * Similar to collectComponents, but it's possible for some components in the page
 * data to be unreachable due to changes. This function reads each components'
 * area list and only recurses to components in those areas.
 */
export function collectReachableComponents (component: ComponentData) {
  const ret = [component] as ComponentData[]
  const areaNames = Object.keys(templateRegistry.getPageOrComponentTemplate(component.templateKey).areas ?? {})
  for (const areaName of areaNames) {
    for (const c of component.areas?.[areaName] ?? []) {
      ret.push(...collectReachableComponents(c))
    }
  }
  return ret
}

/**
 * Removes areas from components that do not exist in its current areas configuration in the
 * template registry. Mutating - you probably want to clone your component before running this.
 */
export function removeUnreachableComponents <T extends ComponentData> (component: T) {
  if (!component.areas) return component
  const areaConfig = templateRegistry.getPageOrComponentTemplate(component.templateKey).areas ?? {}
  for (const areaName of Object.keys(component.areas)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    if (!areaConfig[areaName]) delete component.areas[areaName]
    else for (const c of component.areas[areaName]) removeUnreachableComponents(c)
  }
  return component
}
