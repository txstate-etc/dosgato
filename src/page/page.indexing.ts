import { type LinkDefinition, extractLinksFromText, type PageData } from '@dosgato/templating'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { processLink, templateRegistry, type Index, type SingleValueIndex, collectReachableComponents } from '../internal.js'

export function getPageIndexes (page: PageData): Index[] {
  const storage: Record<string, Set<string>> = {}
  const components = collectReachableComponents(page)
  const indexes = components.flatMap(c => (templateRegistry.get(c.templateKey)?.getLinks(c)?.filter(isNotNull) ?? []).flatMap(processLink) ?? [])
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }

  const tags = components.flatMap(c => templateRegistry.get(c.templateKey)?.getTags?.(c)?.filter(isNotBlank) ?? [])
  if (tags.length) storage.dg_tag = new Set(tags)

  if (isNotBlank(page.legacyId)) storage.legacyId = new Set([page.legacyId])
  storage.template = new Set(components.map(c => c.templateKey).filter(isNotBlank))
  // storage.fulltext = new Set()
  for (const component of components) {
    const texts = (templateRegistry.get(component.templateKey)?.getFulltext?.(component) ?? []).filter(isNotBlank)
    const moreLinks = texts.flatMap(extractLinksFromText).flatMap(processLink)
    for (const index of moreLinks) {
      storage[index.name] ??= new Set()
      storage[index.name].add(index.value)
    }
    // disabling full-text indexing for now as it's just too much data, we'll revisit
    // later - maybe send it to another system like elasticsearch that's more accustomed to fulltext indexing
    // const words = texts.flatMap(t => getKeywords(t))
    // for (const word of words) storage.fulltext.add(word)
  }
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}

export function getPageLinks (page: PageData): LinkDefinition[] {
  const components = collectReachableComponents(page)
  const links = components.flatMap(c => templateRegistry.get(c.templateKey)?.getLinks(c)?.filter(isNotNull) ?? [])

  for (const component of components) {
    const texts = (templateRegistry.get(component.templateKey)?.getFulltext?.(component) ?? []).filter(isNotBlank)
    links.push(...texts.flatMap(extractLinksFromText))
  }
  return links
}

export function singleValueIndexesToIndexes (svIndexes: SingleValueIndex[]) {
  const storage: Record<string, Set<string>> = {}
  for (const index of svIndexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
