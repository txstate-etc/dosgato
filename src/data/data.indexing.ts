import { type DataData, extractLinksFromText } from '@dosgato/templating'
import { isNotBlank } from 'txstate-utils'
import { type Index, templateRegistry, processLink, extractFromHtml, getFulltextNgrams, addIndexes } from '../internal.js'

export function getDataIndexes (data: DataData): Index[] {
  const storage: Record<string, Set<string>> = {}
  storage.template = new Set([data.templateKey])
  addIndexes(storage, templateRegistry.get(data.templateKey)?.getLinks(data).flatMap(processLink) ?? [])

  const tags = templateRegistry.get(data.templateKey)?.getTags?.(data)?.filter(isNotBlank) ?? []
  if (tags.length) storage.dg_tag = new Set(tags)

  const texts = (templateRegistry.get(data.templateKey).getFulltext?.(data) ?? []).filter(isNotBlank)
  storage.fulltext = new Set()
  addIndexes(storage, texts.flatMap(extractLinksFromText).flatMap(processLink))
  storage.fulltext = storage.fulltext.union(getFulltextNgrams(texts))

  const htmls = (templateRegistry.get(data.templateKey).getHtml?.(data) ?? []).filter(isNotBlank)
  for (const html of htmls) {
    const { links: htmlLinks, texts: htmlTexts } = extractFromHtml(html)
    addIndexes(storage, htmlLinks.flatMap(processLink))
    storage.fulltext = storage.fulltext.union(getFulltextNgrams(htmlTexts))
  }

  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}
