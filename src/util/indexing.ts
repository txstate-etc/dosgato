import { type LinkDefinition, extractLinksFromText } from '@dosgato/templating'
import { load } from 'cheerio'
import { doubleMetaphone } from 'double-metaphone'
import { stemmer } from 'stemmer'
import { ensureString, isNotBlank, isNotNull } from 'txstate-utils'

export function getHostname (urlString: string) {
  if (!urlString) return undefined
  urlString = urlString.trim()
  if (/^(data|view-source):/i.test(urlString)) {
    return undefined
  }
  if (urlString.startsWith('//')) urlString = 'http:' + urlString
  try {
    const urlObject = new URL(urlString)
    return urlObject.hostname
  } catch (e: any) {
    return undefined
  }
}

export interface SingleValueIndex {
  name: string
  value: string
}

export type LinkIndexTypes = 'link_asset_id' | 'link_asset_path' | 'link_asset_checksum' | 'link_page_linkId' | 'link_page_path' | 'link_hostname' | 'link_data_id' | 'link_data_path' | 'link_assetfolder_id' | 'link_assetfolder_path' | 'link_datafolder_id' | 'link_datafolder_path'

export function processLink (link: LinkDefinition) {
  let ret: { name: LinkIndexTypes, value: any }[] = []
  if (link.type === 'asset') {
    ret = [
      { name: 'link_asset_id', value: link.id },
      { name: 'link_asset_path', value: link.path },
      { name: 'link_asset_checksum', value: link.checksum }
    ]
  } else if (link.type === 'page') {
    ret = [
      { name: 'link_page_linkId', value: link.linkId },
      { name: 'link_page_path', value: link.path }
    ]
  } else if (link.type === 'data') {
    ret = [
      { name: 'link_data_id', value: link.id },
      { name: 'link_data_path', value: link.path }
    ]
  } else if (link.type === 'assetfolder') {
    ret = [
      { name: 'link_assetfolder_id', value: link.id },
      { name: 'link_assetfolder_path', value: link.path }
    ]
  } else if (link.type === 'datafolder') {
    ret = [
      { name: 'link_datafolder_id', value: link.id },
      { name: 'link_datafolder_path', value: link.path }
    ]
  } else if (link.type === 'url') {
    const hostname = getHostname(link.url)
    if (!hostname) ret = []
    else ret = [{ name: 'link_hostname', value: hostname }]
  }
  return ret.map(l => ({ ...l, value: ensureString(l.value) }) as SingleValueIndex)
}

export function parseLinks (links?: (LinkDefinition | string | undefined)[], templateKey?: string) {
  return (links ?? []).filter(isNotNull).map(l => {
    try {
      return typeof l === 'string' ? JSON.parse(l) as LinkDefinition : l
    } catch (e: any) {
      if (typeof l === 'string' && l.startsWith('http')) return { type: 'url', url: l } as LinkDefinition
      console.warn('Encountered unparseable link', l, 'in a component of type', templateKey ?? 'unknown')
      return undefined
    }
  }).filter(isNotNull)
}

export function normalizeForSearch (str: string) {
  return str?.normalize('NFKD').toLocaleLowerCase().trim() ?? ''
}

const minimalstopwords = new Set(['an', 'and', 'the', 'or', 'to'])
// be sure to pass this a normalized and lowercased string
export function splitWords (normalized: string) {
  return normalized.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !minimalstopwords.has(w))
}

// only send this a single word, normalized and lowercased
export function searchCodes (word: string) {
  return Array.from(new Set([...doubleMetaphone(stemmer(word)), ...doubleMetaphone(word)])).filter(c => c.length > 2)
}

// only send this a single word, normalized and lowercased
export function quadgrams (word: string) {
  const ret: string[] = []
  for (let i = 0; i + 4 <= word.length; i++) {
    ret.push(word.substring(i, i + 4))
  }
  return ret
}

export function ngrams (word: string, n: number) {
  const ret: string[] = []
  for (let i = 0; i + n <= word.length; i++) {
    ret.push(word.substring(i, i + n))
  }
  return ret
}

export function extractFromHtml (html: string): { links: LinkDefinition[], texts: string[] } {
  const $ = load(html)
  const links: LinkDefinition[] = []
  const texts: string[] = []

  $('[href], [src]').each((_, el) => {
    const value = $(el).attr('href') ?? $(el).attr('src')
    if (!value) return
    const extracted = extractLinksFromText(value)
    if (extracted.length) {
      links.push(...extracted)
    } else {
      const hostname = getHostname(value)
      if (hostname) links.push({ type: 'url', url: value })
    }
  })

  $('[alt]').each((_, el) => {
    const alt = $(el).attr('alt')
    if (isNotBlank(alt)) texts.push(alt)
  })

  $('[title]').each((_, el) => {
    const title = $(el).attr('title')
    if (isNotBlank(title)) texts.push(title)
  })

  const textContent = $.text()
  if (isNotBlank(textContent)) texts.push(textContent)

  return { links, texts }
}
