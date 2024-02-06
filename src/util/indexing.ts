import { type LinkDefinition } from '@dosgato/templating'
import { doubleMetaphone } from 'double-metaphone'
import { stemmer } from 'stemmer'
import { ensureString, isNotNull } from 'txstate-utils'

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
  return str.normalize('NFKD').toLocaleLowerCase()
}

const minimalstopwords = new Set(['an', 'and', 'the', 'or', 'to'])
// be sure to pass this a normalized and lowercased string
export function splitWords (normalized: string) {
  return normalized.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !minimalstopwords.has(w))
}

// only send this a single word, normalized and lowercased
export function searchCodes (word: string) {
  return [...doubleMetaphone(stemmer(word)), ...doubleMetaphone(word)]
}

// only send this a single word, normalized and lowercased
export function quadgrams (word: string) {
  const ret: string[] = []
  for (let i = 0; i + 4 <= word.length; i++) {
    ret.push(word.substring(i, i + 4))
  }
  return ret
}
