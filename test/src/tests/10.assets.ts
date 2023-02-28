import { expect } from 'chai'
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
