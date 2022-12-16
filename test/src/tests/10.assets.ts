import { expect } from 'chai'
import { hashify } from 'txstate-utils'
import { query, queryAs } from '../common.js'

describe('assetfolders', () => {
  let testSiteId: string
  let folderhash: any
  before(async () => {
    const { sites } = await query('{ sites { id name assetroot { id name folders(recursive: true, filter: { deleted: SHOW } ) { id name } } } }')
    const site8 = sites.find((s: any) => s.name === 'site8')
    testSiteId = site8.id
    folderhash = hashify(site8.assetroot.folders, 'name')
    folderhash[site8.assetroot.name] = { id: site8.assetroot.id, name: site8.assetroot.name }
  })
  it('should retrieve asset folders recursively', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id folders(recursive: true, filter: { deleted: SHOW }) { name } } } }`)
    expect(sites[0].assetroot.folders).to.deep.include.members([{ name: 'folderA' }, { name: 'folderD' }, { name: 'folderF' }, { name: 'folderH' }, { name: 'folderJ' }, { name: 'folderL' }])
  })
  it('should retrieve asset folders by id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id folders(filter: { ids: ["${folderhash.folderA.id}","${folderhash.folderB.id}"]}) { id name } } } }`)
    expect(sites[0].assetroot.folders).to.have.lengthOf(2)
    expect(sites[0].assetroot.folders).to.have.deep.members([folderhash.folderA, folderhash.folderB])
  })
  it('should retrieve deleted asset folders', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id folders(filter: { deleted: ONLY }) { name } } } }`)
    expect(sites[0].assetroot.folders).to.deep.equal([{ name: 'folderD' }])
  })
  it('should retrieve asset folders\' parent folders', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id name folders(filter: { parentOfFolderIds: ["${folderhash.folderF.id}","${folderhash.folderH.id}","${folderhash.folderJ.id}"] }) { id name } } } }`)
    expect(sites[0].assetroot.folders).to.have.lengthOf(3)
    expect(sites[0].assetroot.folders).to.have.deep.members([folderhash.folderA, folderhash.folderC, folderhash.folderE])
  })
  it('should retrieve asset folders by child id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id name folders(recursive: true, filter: { childOfFolderIds: ["${folderhash.folderA.id}","${folderhash.folderE.id}"] }) { id name } } } }`)
    expect(sites[0].assetroot.folders).to.have.lengthOf(4)
    expect(sites[0].assetroot.folders).to.have.deep.members([folderhash.folderF, folderhash.folderG, folderhash.folderI, folderhash.folderJ])
  })
  it('should retrieve asset folders by site id', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { id assetroot { id name folders(filter: { siteIds: [${testSiteId}], deleted: SHOW }) { id name } } } }`)
    expect(sites[0].assetroot.folders).to.deep.include.members([folderhash.folderA, folderhash.folderB, folderhash.folderC, folderhash.folderD, folderhash.folderE])
  })
})

describe('assets', () => {
  it.skip('should retrieve an asset by ID', async () => {})
  it.skip('should retrieve assets by site ID', async () => {})
  it.skip('should retrieve assets by link', async () => {})
  it.skip('should retrieve assets by checksum', async () => {})
  it.skip('should retrieve assets by folder ID', async () => {})
  it.skip('should retrieve assets by name', async () => {})
  it.skip('should retrieve assets by path', async () => {})
  it.skip('should retrieve assets by ancestor path (beneath filter)', async () => {})
  it.skip('should retrieve assets by parent path', async () => {})
  it.skip('should retrieve assets by bytes (greater than)', async () => {})
  it.skip('should retrieve assets by byes (less than)', async () => {})
  it.skip('should retrieve only deleted assets', async () => {})
  it.skip('should retrieve assets that are not fully deleted', async () => {})
})
