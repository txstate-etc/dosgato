import { DataEntryData, Index, templateRegistry, processLink, extractLinksFromText, getKeywords } from 'internal'

export function getDataIndexes (data: DataEntryData): Index[] {
  const storage: Record<string, Set<string>> = {}
  storage.template = new Set([data.templateKey])
  const indexes = templateRegistry.get(data.templateKey).getLinks(data).map(processLink).flat()
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  const text = templateRegistry.get(data.templateKey).getFulltext(data)
  storage.fulltext = new Set()
  const moreLinks = text.flatMap(extractLinksFromText).flatMap(processLink)
  for (const index of moreLinks) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  const words = text.flatMap(t => getKeywords(t))
  for (const word of words) storage.fulltext.add(word)
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
