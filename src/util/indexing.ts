import { stopwords } from './stopwords'
import stringify from 'fast-json-stable-stringify'
import { Field, ID, InputType } from 'type-graphql'

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

@InputType()
export class PageLink {
  type!: 'page'
  @Field()
  linkId!: string

  @Field(type => ID)
  siteId!: string

  @Field()
  path!: string
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

export type LinkIndexTypes = 'link_asset'|'link_page'|'link_hostname'|'link_data'|'link_assetfolder'|'link_datafolder'

export function processLink (link: LinkDefinition) {
  let ret: { name: LinkIndexTypes, value: any }[] = []
  if (link.type === 'asset') {
    ret = [
      { name: 'link_asset', value: { source: link.source, id: link.id } },
      { name: 'link_asset', value: { siteId: link.siteId, path: link.path } },
      { name: 'link_asset', value: { checksum: link.checksum } }
    ]
  } else if (link.type === 'page') {
    ret = [
      { name: 'link_page', value: { linkId: link.linkId } },
      { name: 'link_page', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'data') {
    ret = [
      { name: 'link_data', value: { linkId: link.id } },
      { name: 'link_data', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'assetfolder') {
    ret = [
      { name: 'link_assetfolder', value: { linkId: link.id } },
      { name: 'link_assetfolder', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'datafolder') {
    ret = [
      { name: 'link_datafolder', value: { linkId: link.id } },
      { name: 'link_datafolder', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'url') {
    const hostname = getHostname(link.url)
    if (!hostname) ret = []
    else ret = [{ name: 'link_hostname', value: hostname }]
  }
  return ret.map(l => ({ ...l, value: stringify(l.value) }) as SingleValueIndex)
}
