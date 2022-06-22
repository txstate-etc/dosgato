import { LinkDefinition } from '@dosgato/templating'
import { stringify } from 'txstate-utils'

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

export type LinkIndexTypes = 'link_asset'|'link_page'|'link_hostname'|'link_data'|'link_assetfolder'|'link_datafolder'

export function processLink (link: LinkDefinition) {
  let ret: { name: LinkIndexTypes, value: any }[] = []
  if (link.type === 'asset') {
    ret = [
      { name: 'link_asset', value: { source: link.source, id: link.id } },
      { name: 'link_asset', value: { path: link.path } },
      { name: 'link_asset', value: { checksum: link.checksum } }
    ]
  } else if (link.type === 'page') {
    ret = [
      { name: 'link_page', value: { linkId: link.linkId } },
      { name: 'link_page', value: { path: link.path } }
    ]
  } else if (link.type === 'data') {
    ret = [
      { name: 'link_data', value: { linkId: link.id } },
      { name: 'link_data', value: { siteId: link.siteId, path: link.path } }
    ]
  } else if (link.type === 'assetfolder') {
    ret = [
      { name: 'link_assetfolder', value: { linkId: link.id } },
      { name: 'link_assetfolder', value: { path: link.path } }
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
