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
  it('should not allow an unauthorized user to create an asset folder', async () => {
    await expect(createAssetFolder('test', testSiteAId, siteAAssetRootId, 'ed07')).to.be.rejected
  })
  it('should rename an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder2', testSiteAId, siteAAssetRootId)
    const { renameAssetFolder: { success, assetFolder } } = await query('mutation RenameAssetFolder ($folderId: ID!, $name: String!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: folder.id, name: 'childfolder2renamed' })
    expect(success).to.be.true
    expect(assetFolder.name).to.equal('childfolder2renamed')
  })
  it('should not allow the root asset folder to be renamed', async () => {
    await expect(query('mutation RenameAssetFolder ($folderId: ID!, $name: String!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: siteAAssetRootId, name: 'shouldnotwork' })).to.be.rejected
  })
  it('should not allow an unauthorized user to rename an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder3', testSiteAId, siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation RenameAssetFolder ($folderId: ID!, $name: String!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: folder.id, name: 'shouldnotwork' })).to.be.rejected
  })
  it.skip('should move an asset folder', async () => {})
  it.skip('should not allow the root asset folder to be moved', async () => {})
  it.skip('should not allow an unauthorized user to move an asset folder', async () => {})
  it('should delete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder4', testSiteAId, siteAAssetRootId)
    const { deleteAssetFolder: { success, assetFolder } } = await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    expect(success).to.be.true
    expect(assetFolder.deleted).to.be.true
    expect(assetFolder.deletedBy.id).to.equal('su01')
    expect(assetFolder.deletedAt).to.not.be.null
  })
  it('should not allow the root asset folder to be deleted', async () => {
    await expect(query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name } } }', { folderId: siteAAssetRootId })).to.be.rejected
  })
  it('should not allow an unauthorized user to delete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder5', testSiteAId, siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })).to.be.rejected
  })
  it('should undelete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder6', testSiteAId, siteAAssetRootId)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    const { undeleteAssetFolder: { success, assetFolder } } = await query('mutation UndeleteAssetFolder ($folderId: ID!) { undeleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    expect(success).to.be.true
    expect(assetFolder.deleted).to.be.false
    expect(assetFolder.deletedBy).to.be.null
    expect(assetFolder.deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder7', testSiteAId, siteAAssetRootId)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    await expect(queryAs('ed07', 'mutation UndeleteAssetFolder ($folderId: ID!) { undeleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })).to.be.rejected
  })
})
