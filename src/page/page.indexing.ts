import { extractLinksFromText, getKeywords, processLink } from '../util/indexing'
import { templateRegistry } from '../util/registry'
import { PageData } from '../util/sharedtypes'
import { Index } from '../versionedservice'
import { collectComponents } from './page.util'

export function getPageIndexes (page: PageData): Index[] {
  const storage: Record<string, Set<string>> = {}
  const components = collectComponents(page)
  const indexes = components.flatMap(c => templateRegistry.get(c.templateKey).getLinks(c).flatMap(processLink))
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  storage.template = new Set(components.map(c => c.templateKey))
  storage.fulltext = new Set()
  for (const component of components) {
    const text = templateRegistry.get(component.templateKey).getFulltext(component)
    const moreLinks = text.flatMap(extractLinksFromText).flatMap(processLink)
    for (const index of moreLinks) {
      storage[index.name] ??= new Set()
      storage[index.name].add(index.value)
    }
    const words = text.flatMap(t => getKeywords(t))
    for (const word of words) storage.fulltext.add(word)
  }
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
