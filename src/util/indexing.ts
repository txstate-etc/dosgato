import { stopwords } from './stopwords'
import stringify from 'fast-json-stable-stringify'

export interface AssetLink {
  type: 'asset'
  source: string
  id: string
  siteId: string
  path: string
  checksum: string
}

export interface AssetFolderLink {
  type: 'assetfolder'
  id: string // the asset folder's guid
  siteId: string
  path: string
}

export interface PageLink {
  type: 'page'
  linkId: string
  siteId: string
  path: string
}

export interface WebLink {
  type: 'url'
  url: string
}

export interface DataLink {
  type: 'data'
  id: string // the data item's dataId
  siteId?: string // null if global data
  path: string
}

export interface DataFolderLink {
  type: 'datafolder'
  id: string // the asset folder's guid
  siteId?: string // null if global data
  path: string
}

export type LinkDefinition = AssetLink | AssetFolderLink | PageLink | WebLink | DataLink | DataFolderLink

export type LinkGatheringFn = (data: any) => LinkDefinition[]
export type FulltextGatheringFn = (data: any) => string[]

export function getKeywords (text: string) {
  return Array.from(new Set(text
    .toLocaleLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .split(/[^\w]+/)
    .filter(word => word.length > 2 && !stopwords[word] && isNaN(Number(word)))
  ))
}

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

export interface Index {
  name: string
  value: string[]
}

export type LinkIndexTypes = 'link_asset_id'|'link_asset_path'|'link_asset_checksum'|
'link_page_id'|'link_page_path'|'link_hostname'|
'link_data_id'|'link_data_path'|
'link_assetfolder_id'|'link_assetfolder_path'|
'link_datafolder_id'|'link_datafolder_path'

export function processLink (link: LinkDefinition) {
  let ret: { name: LinkIndexTypes, value: any }[] = []
  if (link.type === 'asset') {
    ret = [
      { name: 'link_asset_id', value: { source: link.source, id: link.id } },
      { name: 'link_asset_path', value: { siteId: link.siteId, path: link.path } },
      { name: 'link_asset_checksum', value: { checksum: link.checksum } }
    ]
  } else if (link.type === 'page') {
    ret = [
      { name: 'link_page_id', value: { linkId: link.linkId } },
      { name: 'link_page_path', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'data') {
    ret = [
      { name: 'link_data_id', value: { linkId: link.id } },
      { name: 'link_data_path', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'assetfolder') {
    ret = [
      { name: 'link_assetfolder_id', value: { linkId: link.id } },
      { name: 'link_assetfolder_path', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'datafolder') {
    ret = [
      { name: 'link_datafolder_id', value: { linkId: link.id } },
      { name: 'link_datafolder_path', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'url') {
    const hostname = getHostname(link.url)
    if (!hostname) ret = []
    else ret = [{ name: 'link_hostname', value: hostname }]
  }
  return ret.map(l => ({ ...l, value: stringify(l.value) }) as SingleValueIndex)
}
