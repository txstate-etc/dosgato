import { type DataData, extractLinksFromText, getKeywords } from '@dosgato/templating'
import { isNotBlank } from 'txstate-utils'
import { type Index, templateRegistry, processLink } from '../internal.js'

export function getDataIndexes (data: DataData): Index[] {
  const storage: Record<string, Set<string>> = {}
  storage.template = new Set([data.templateKey])
  const indexes = templateRegistry.get(data.templateKey)?.getLinks(data).flatMap(processLink) ?? []
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }

  const tags = templateRegistry.get(data.templateKey)?.getTags?.(data)?.filter(isNotBlank) ?? []
  if (tags.length) storage.dg_tag = new Set(tags)

  const texts = (templateRegistry.get(data.templateKey).getFulltext?.(data) ?? []).filter(isNotBlank)
  storage.fulltext = new Set()
  const moreLinks = texts.flatMap(extractLinksFromText).flatMap(processLink)
  for (const index of moreLinks) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
  const words = texts.flatMap(t => getKeywords(t))
  for (const word of words) storage.fulltext.add(word)
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
