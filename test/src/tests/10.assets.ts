import { expect } from 'chai'
import { assert } from 'console'
import { keyby } from 'txstate-utils'
import { query } from '../common.js'

describe('assetfolders', () => {
  let testSiteId: string
  let folderhash: any
  before(async () => {
    const { sites } = await query('{ sites { id name rootAssetFolder { id name folders(recursive: true, filter: { deleteStates: [ALL] } ) { id name } } } }')
    const site8 = sites.find((s: any) => s.name === 'site8')
    testSiteId = site8.id
    folderhash = keyby(site8.rootAssetFolder.folders, 'name')
    folderhash[site8.rootAssetFolder.name] = { id: site8.rootAssetFolder.id, name: site8.rootAssetFolder.name }
  })
  it('should retrieve asset folders recursively', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id folders(recursive: true, filter: { deleteStates: [ALL] }) { name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.deep.include.members([{ name: 'folder-a' }, { name: 'folder-d' }, { name: 'folder-f' }, { name: 'folder-h' }, { name: 'folder-j' }, { name: 'folder-l' }])
  })
  it('should retrieve asset folders by id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id folders(filter: { ids: ["${folderhash['folder-a'].id}","${folderhash['folder-b'].id}"]}) { id name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.have.lengthOf(2)
    expect(sites[0].rootAssetFolder.folders).to.have.deep.members([folderhash['folder-a'], folderhash['folder-b']])
  })
  it('should retrieve deleted asset folders', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id folders(filter: { deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED] }) { name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.deep.equal([{ name: 'folder-d' }])
  })
  it('should retrieve asset folders\' parent folders', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id name folders(filter: { parentOfFolderIds: ["${folderhash['folder-f'].id}","${folderhash['folder-h'].id}","${folderhash['folder-j'].id}"] }) { id name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.have.lengthOf(3)
    expect(sites[0].rootAssetFolder.folders).to.have.deep.members([folderhash['folder-a'], folderhash['folder-c'], folderhash['folder-e']])
  })
  it('should retrieve asset folders by child id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id name folders(recursive: true, filter: { childOfFolderIds: ["${folderhash['folder-a'].id}","${folderhash['folder-e'].id}"] }) { id name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.have.lengthOf(4)
    expect(sites[0].rootAssetFolder.folders).to.have.deep.members([folderhash['folder-f'], folderhash['folder-g'], folderhash['folder-i'], folderhash['folder-j']])
  })
  it('should retrieve asset folders by site id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id rootAssetFolder { id name folders(filter: { siteIds: [${testSiteId}], deleteStates: [ALL] }) { id name } } } }`)
    expect(sites[0].rootAssetFolder.folders).to.deep.include.members([folderhash['folder-a'], folderhash['folder-b'], folderhash['folder-c'], folderhash['folder-d'], folderhash['folder-e']])
  })
})

interface Asset {
  id: string
  mime: string
  name: string
  extension: string
  path: string
  filename: string
  checksum: string
  box?: {
    width: number
    height: number
  }
  resizes: {
    width: number
    height: number
    mime: string
  }
  folder: {
    id: string
  }
  site: {
    id: string
    name: string
  }
}
describe('assets', () => {
  let allAssets: Asset[]
  before(async () => {
    const { assets } = await query<{ assets: Asset[] }>('{ assets { id mime name filename path checksum box { width height } resizes { width height mime } folder { id } site { id, name } } }')
    allAssets = assets
  })
  it('should have width and height for images', async () => {
    for (const a of allAssets) {
      if (a.mime.startsWith('image/')) expect(a.box?.width).to.be.greaterThan(0)
    }
  })
  it('should retrieve an asset by ID', async () => {
    const assetId = allAssets[0].id
    const { assets } = await query<{ assets: [Asset] }>('query getAssetById ($assetId: ID!) { assets (filter: { ids: [$assetId] }) { id name } }', { assetId })
    expect(assets).to.have.lengthOf(1)
    expect(assets[0].id).to.equal(assetId)
  })
  it('should retrieve assets by site ID', async () => {
    const siteId = allAssets[0].site.id
    const { assets } = await query<{ assets: Asset[] }>('query getAssetById ($siteId: ID!) { assets (filter: { siteIds: [$siteId] }) { id name site { id } } }', { siteId })
    expect(assets.length).to.be.greaterThan(0)
    for (const a of assets) expect(a.site.id).to.equal(siteId)
  })
  it.skip('should retrieve assets by link', async () => {})
  it('should retrieve assets by checksum', async () => {
    const checksum = allAssets[0].checksum
    const { assets } = await query<{ assets: [Asset] }>('query getAssetById ($checksum: String!) { assets (filter: { checksums: [$checksum] }) { id name checksum } }', { checksum })
    expect(assets.length).to.be.greaterThan(0)
    for (const a of assets) expect(a.checksum).to.equal(checksum)
  })
  it('should retrieve assets by folder ID', async () => {
    const folderId = allAssets[0].folder.id
    const { assets } = await query<{ assets: Asset[] }>('query getAssetById ($folderId: ID!) { assets (filter: { folderIds: [$folderId] }) { id name folder { id } } }', { folderId })
    expect(assets.length).to.be.greaterThan(0)
    for (const a of assets) expect(a.folder.id).to.equal(folderId)
  })
  it.skip('should retrieve assets by name', async () => {})
  it.skip('should retrieve assets by path', async () => {})
  it('should retrieve assets by path', async () => {
    const { assets } = await query<{ assets: Asset[] }>('query getAssetByPath ($path: FilenameSafePath!) { assets(filter: { paths: [$path] }) { id name extension }}', { path: '/site1/bobcat' })
    expect(assets[0].name).to.equal('bobcat')
  })
  it('should retrieve assets by path (case insensitive)', async () => {
    const { assets } = await query<{ assets: Asset[] }>('query getAssetByPath ($path: FilenameSafePath!) { assets(filter: { paths: [$path] }) { id name extension }}', { path: '/site1/BOBCAT' })
    expect(assets[0].name).to.equal('bobcat')
  })
  it.skip('should retrieve assets by ancestor path (beneath filter)', async () => {})
  it('should retrieve assets by parent path', async () => {
    const site1Filenames = allAssets.filter(a => a.site.name === 'site1').map(a => a.filename)
    const { assets } = await query<{ assets: Asset[] }>('query getDGAPIAssetsByPath ($path: UrlSafePath!) { assets(filter: { parentPaths: [$path] }) { id name extension filename }}', { path: '/site1' })
    // { "id": "In_iLDmeSv", "name": "blankpdf", "extension": "pdf" }, { "id": "jg3-gl2HdR", "name": "bobcat", "extension": "jpg" }
    expect(assets.length).to.equal(site1Filenames.length)
    for (const filename of assets.map(a => a.filename)) {
      expect(site1Filenames).to.contain(filename)
    }
  })
  it('should retrieve assets by bytes (greater than)', async () => {
    const { assets } = await query<{ assets: Asset[] }>('query getDGAPIAssetsBySize ($size: Int!) { assets(filter: { bytes: $size }) { id name extension filename, size, checksum site { id, name } }}', { size: 1265 })
    // { "id": "FNliuvzd-U", "filename": "bobcat.jpg", "size": 3793056, "site": { "id": "7", "name": "site1"}}
    expect(assets.length).to.be.greaterThan(0)
    const site1Filenames = assets.filter(a => a.site.name === 'site1').map(a => a.filename)
    expect(site1Filenames).to.contain('bobcat.jpg')
  })
  it('should retrieve assets by bytes (less than)', async () => {
    const { assets } = await query<{ assets: Asset[] }>('query getDGAPIAssetsBySize ($size: Int!) { assets(filter: { bytes: $size }) { id name extension filename, size, checksum site { id, name } }}', { size: -1265 })
    // { "id": "3fg2JqZ2Kv", "filename": "blankpdf.pdf", "size": 1264, "site": { "id": "7", "name": "site1"}},
    // { "id": "zgc7eUI06H", "filename": "blankpdf.pdf", "size": 1264, "site": { "id": "2", "name": "site8"}}
    expect(assets.length).to.be.greaterThan(1)
    const site1Filenames = assets.filter(a => a.site.name === 'site1').map(a => a.filename)
    expect(site1Filenames).to.contain('blankpdf.pdf')
  })
  it.skip('should retrieve only deleted assets', async () => {})
  it.skip('should retrieve assets that are not fully deleted', async () => {})
})
