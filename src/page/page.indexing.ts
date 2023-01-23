import { extractLinksFromText, getKeywords, PageData } from '@dosgato/templating'
import { isNotBlank } from 'txstate-utils'
import { processLink, templateRegistry, Index, collectComponents } from '../internal.js'

export function getPageIndexes (page: PageData): Index[] {
  const storage: Record<string, Set<string>> = {}
  const components = collectComponents(page)
  const indexes = components.flatMap(c => (templateRegistry.get(c.templateKey)?.getLinks(c)).flatMap(processLink) ?? [])
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  if (isNotBlank(page.legacyId)) storage.legacyId = new Set([page.legacyId])
  storage.template = new Set(components.map(c => c.templateKey).filter(isNotBlank))
  storage.fulltext = new Set()
  for (const component of components) {
    const texts = (templateRegistry.get(component.templateKey)?.getFulltext?.(component) ?? []).filter(isNotBlank)
    const moreLinks = texts.flatMap(extractLinksFromText).flatMap(processLink)
    for (const index of moreLinks) {
      storage[index.name] ??= new Set()
      storage[index.name].add(index.value)
    }
    const words = texts.flatMap(t => getKeywords(t))
    for (const word of words) storage.fulltext.add(word)
  }
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
