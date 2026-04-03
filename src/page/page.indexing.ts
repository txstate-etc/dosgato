import { type LinkDefinition, extractLinksFromText, type PageData } from '@dosgato/templating'
import { isNotBlank, isNotNull } from 'txstate-utils'
import { processLink, templateRegistry, type Index, type SingleValueIndex, collectReachableComponents, extractFromHtml } from '../internal.js'

export function getPageIndexes (page: PageData): Index[] {
  const storage: Record<string, Set<string>> = {}
  const components = collectReachableComponents(page)
  addIndexes(storage, components.flatMap(c => (templateRegistry.get(c.templateKey)?.getLinks(c)?.filter(isNotNull) ?? []).flatMap(processLink) ?? []))

  const tags = components.flatMap(c => templateRegistry.get(c.templateKey)?.getTags?.(c)?.filter(isNotBlank) ?? [])
  if (tags.length) storage.dg_tag = new Set(tags)

  if (isNotBlank(page.legacyId)) storage.legacyId = new Set([page.legacyId])
  storage.template = new Set(components.map(c => c.templateKey).filter(isNotBlank))
  storage.fulltext = new Set()
  for (const component of components) {
    const texts = (templateRegistry.get(component.templateKey)?.getFulltext?.(component) ?? []).filter(isNotBlank)
    addIndexes(storage, texts.flatMap(extractLinksFromText).flatMap(processLink))
    storage.fulltext = storage.fulltext.union(getFulltextNgrams(texts))

    const htmls = (templateRegistry.get(component.templateKey)?.getHtml?.(component) ?? []).filter(isNotBlank)
    for (const html of htmls) {
      const { links: htmlLinks, texts: htmlTexts } = extractFromHtml(html)
      addIndexes(storage, htmlLinks.flatMap(processLink))
      storage.fulltext = storage.fulltext.union(getFulltextNgrams(htmlTexts))
    }
  }
  return Object.keys(storage).map(k => ({ name: k, values: Array.from(storage[k]) }))
}

export function getPageTexts (page: PageData): string[] {
  const components = collectReachableComponents(page)
  const texts = components.flatMap(c => templateRegistry.get(c.templateKey)?.getFulltext?.(c) ?? []).filter(isNotBlank)
  const htmlTexts = components.flatMap(c => (templateRegistry.get(c.templateKey)?.getHtml?.(c) ?? []).filter(isNotBlank).flatMap(html => extractFromHtml(html).texts))
  return [...texts, ...htmlTexts]
}

export function getPageLinks (page: PageData): LinkDefinition[] {
  const components = collectReachableComponents(page)
  const links = components.flatMap(c => templateRegistry.get(c.templateKey)?.getLinks(c)?.filter(isNotNull) ?? [])

  for (const component of components) {
    const texts = (templateRegistry.get(component.templateKey)?.getFulltext?.(component) ?? []).filter(isNotBlank)
    links.push(...texts.flatMap(extractLinksFromText))

    const htmls = (templateRegistry.get(component.templateKey)?.getHtml?.(component) ?? []).filter(isNotBlank)
    links.push(...htmls.flatMap(html => extractFromHtml(html).links))
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

export function getFulltextNgrams (texts: string[]) {
  const set = new Set<string>()
  for (const text of texts) {
    for (const word of getKeywords(text)) {
      if (word.length <= 4) {
        set.add(word)
      } else {
        for (let i = 0; i < word.length - 4; i++) {
          set.add(word.slice(i, i + 5))
        }
      }
    }
  }
  return set
}

export function addIndexes (storage: Record<string, Set<string>>, indexes: SingleValueIndex[]) {
  for (const index of indexes) {
    storage[index.name] ??= new Set()
    storage[index.name].add(index.value)
  }
}

export function getKeywords (text?: string, options?: { stopwords?: boolean }) {
  if (!text) return []
  return Array.from(new Set(text
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .flatMap(word => word.includes('-') ? word.split('-').concat(word.replaceAll('-', '')) : [word])
    .flatMap(word => /\d/.test(word) && isNaN(Number(word)) ? word.split(/(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)/) : [word])
    .filter(word =>
      word.length > 2 &&
      (options?.stopwords === false || !stopwords.has(word)))
  ))
}

export const stopwords = new Set([
  'myself', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom',
  'this', 'that', 'these', 'those',
  'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having',
  'does', 'did', 'doing',
  'the', 'and', 'but', 'because', 'until', 'while',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'nor', 'not', 'only', 'own', 'same', 'than', 'too', 'very',
  'can', 'will', 'just', 'don', 'should', 'now',
  // HTML
  'div', 'span', 'img', 'abbr', 'area', 'main', 'aside', 'blockquote',
  'button', 'caption', 'code', 'del', 'strong', 'font', 'embed', 'fieldset',
  'form', 'figure', 'iframe', 'label', 'input', 'script', 'nav', 'select',
  'option', 'picture', 'pre', 'small', 'style', 'svg', 'sub', 'table', 'tbody',
  'href', 'src', 'srcset', 'class', 'textarea', 'title', 'onclick',
  'www', 'com',
  // LinkDefinition
  'siteId', 'path', 'type', 'assetId', 'linkId', 'url'
])
