/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

async function createAssetFolder (name: string, siteId: string, parentId: string, username?: string) {
  const { createAssetFolder: { success, messages, assetFolder } } = await queryAs((username ?? 'su01'), 'mutation CreateAssetFolder ($args: CreateAssetFolderInput!) { createAssetFolder (args: $args) { success messages { message } assetFolder { id name folder { id name } } } }', { args: { siteId, name, parentId } })
  return { success, messages, assetFolder }
}

describe('asset mutations', () => {
  let testSiteAId: string
  let siteAAssetRootId: string
  before(async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name assetroot { id } } } }', { args: { name: 'assetTestSiteA', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    testSiteAId = site.id
    siteAAssetRootId = site.assetroot.id
  })
  it('should create an asset folder', async () => {
    const { success, assetFolder } = await createAssetFolder('childfolder1', testSiteAId, siteAAssetRootId)
    expect(success).to.be.true
    expect(assetFolder.name).to.equal('childfolder1')
  })
  it('should not allow an unauthorized user to create an assetfolder', async () => {
    await expect(createAssetFolder('test', testSiteAId, siteAAssetRootId, 'ed07')).to.be.rejected
  })
})
