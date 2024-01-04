/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, postMultipart } from '../common.js'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createAssetFolder (name: string, parentId: string, username?: string) {
  const { createAssetFolder: { success, messages, assetFolder } } = await queryAs((username ?? 'su01'), 'mutation CreateAssetFolder ($args: CreateAssetFolderInput!) { createAssetFolder (args: $args) { success messages { message } assetFolder { id name folder { id name } } } }', { args: { name, parentId } })
  return { success, messages, assetFolder }
}

describe('asset mutations', () => {
  let testSiteAId: string
  let siteAAssetRootId: string
  let siteATestFolderId: string
  before(async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootAssetFolder { id } } } }', { name: 'assetTestSiteA', data: { templateKey: 'keyp1', savedAtVersion: '20220801120000', title: 'Test Title' } })
    testSiteAId = site.id
    siteAAssetRootId = site.rootAssetFolder.id
    const { assetFolder } = await createAssetFolder('assettestfolder', siteAAssetRootId, 'su01')
    siteATestFolderId = assetFolder.id
  })
  it('should create an asset folder', async () => {
    const { success, assetFolder } = await createAssetFolder('childfolder1', siteAAssetRootId)
    expect(success).to.be.true
    expect(assetFolder.name).to.equal('childfolder1')
  })
  it('should not allow an unauthorized user to create an asset folder', async () => {
    await expect(createAssetFolder('test', siteAAssetRootId, 'ed07')).to.be.rejected
  })
  it('should rename an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder2', siteAAssetRootId)
    const { renameAssetFolder: { success, assetFolder } } = await query('mutation RenameAssetFolder ($folderId: ID!, $name: UrlSafeString!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: folder.id, name: 'childfolder2renamed' })
    expect(success).to.be.true
    expect(assetFolder.name).to.equal('childfolder2renamed')
  })
  it('should not allow the root asset folder to be renamed', async () => {
    await expect(query('mutation RenameAssetFolder ($folderId: ID!, $name: UrlSafeString!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: siteAAssetRootId, name: 'shouldnotwork' })).to.be.rejected
  })
  it('should not allow an unauthorized user to rename an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder3', siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation RenameAssetFolder ($folderId: ID!, $name: UrlSafeString!) { renameAssetFolder (folderId: $folderId, name: $name) { success assetFolder { id name } } }', { folderId: folder.id, name: 'shouldnotwork' })).to.be.rejected
  })
  it('should delete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder4', siteAAssetRootId)
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
    const { assetFolder: folder } = await createAssetFolder('childfolder5', siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })).to.be.rejected
  })
  it('should undelete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder6', siteAAssetRootId)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    const { undeleteAssetFolder: { success, assetFolder } } = await query('mutation UndeleteAssetFolder ($folderId: ID!) { undeleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    expect(success).to.be.true
    expect(assetFolder.deleted).to.be.false
    expect(assetFolder.deletedBy).to.be.null
    expect(assetFolder.deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete an asset folder', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder7', siteAAssetRootId)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    await expect(queryAs('ed07', 'mutation UndeleteAssetFolder ($folderId: ID!) { undeleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })).to.be.rejected
  })
  it('should move an asset folder', async () => {
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder8', siteAAssetRootId)
    const { assetFolder: folder } = await createAssetFolder('grandchildfolder1', siteAAssetRootId)
    expect(folder.folder.name).to.equal('assettestsitea')
    const { moveAssetsAndFolders: { success, assetFolder } } = await query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetsAndFolders (folderIds: [$folderId], targetFolderId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: folder.id, targetId: targetFolder.id })
    expect(success).to.be.true
    expect(assetFolder.id).to.equal(targetFolder.id)
  })
  it('should not allow the root asset folder to be moved', async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootAssetFolder { id } } } }', { name: 'assetTestSiteB', data: { templateKey: 'keyp1', savedAtVersion: '20220801120000', title: 'Test Title' } })
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder9', site.rootAssetFolder.id)
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: siteAAssetRootId, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not move an asset folder below itself', async () => {
    const { assetFolder: movingFolder } = await createAssetFolder('childfolder10', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder11', movingFolder.id)
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: movingFolder.id, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not allow an unauthorized user to move an asset folder', async () => {
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder12', siteAAssetRootId)
    const { assetFolder: folder } = await createAssetFolder('grandchildfolder2', siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: folder.id, targetId: targetFolder.id })).to.be.rejected
  })

  it('should create an asset', async () => {
    const { ids, success } = await postMultipart(`/assets/${siteAAssetRootId}`, {}, '/usr/app/files/blank.jpg', 'su01')
    expect(success).to.be.true
    const { assets } = await query('query getAsset ($ids: [ID!]!) { assets (filter: { ids: $ids }) { filename, mime, size } }', { ids })
    const upload = assets[0]
    expect(upload.filename).to.equal('blank.jpg')
    expect(upload.mime).to.equal('image/jpeg')
    expect(upload.size).to.equal(75533)
  })
  it.skip('should move an asset', async () => {})
  it.skip('should copy an asset', async () => {})
  it('should delete assets', async () => {
    const { createSite: { site: siteC } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootAssetFolder { id } } } }', { name: 'assetTestSiteC', data: { templateKey: 'keyp1', savedAtVersion: '20231208120000', title: 'Site C Test Title' } })
    const siteCAssetRootId = siteC.rootAssetFolder.id
    const results = await Promise.all([
      postMultipart(`/assets/${siteCAssetRootId}`, {}, '/usr/app/files/blank.jpg', 'su01'),
      postMultipart(`/assets/${siteCAssetRootId}`, {}, '/usr/app/files/blankpdf.pdf', 'su01')
    ])
    const assetIds: string[] = [results[0].ids, results[1].ids].flat()
    const { deleteAssets: { success, assets } } = await query('mutation DeleteAssets ($assetIds: [ID!]!) {deleteAssets (assetIds: $assetIds) { success assets { id name deleted deletedAt deletedBy { id firstname lastname } deleteState } } }', { assetIds })
    expect(success).to.be.true
    for (const a of assets) {
      expect(a.deleteState).to.equal('MARKEDFORDELETE')
      expect(a.deleted).to.be.true
    }
  })
  it('should finalize deletion of assets', async () => {
    const { createSite: { site: siteD } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootAssetFolder { id } } } }', { name: 'assetTestSiteD', data: { templateKey: 'keyp1', savedAtVersion: '20231208120000', title: 'Site D Test Title' } })
    const siteDAssetRootId = siteD.rootAssetFolder.id
    const results = await Promise.all([
      postMultipart(`/assets/${siteDAssetRootId}`, {}, '/usr/app/files/blank.jpg', 'su01'),
      postMultipart(`/assets/${siteDAssetRootId}`, {}, '/usr/app/files/blankpdf.pdf', 'su01')
    ])
    const assetIds: string[] = [results[0].ids, results[1].ids].flat()
    await query('mutation DeleteAssets ($assetIds: [ID!]!) {deleteAssets (assetIds: $assetIds) { success assets { id name deleted deletedAt deletedBy { id firstname lastname } deleteState } } }', { assetIds })
    const { finalizeDeleteAssets: { success, assets } } = await query('mutation FinalizeDeleteAssets ($assetIds: [ID!]!) {finalizeDeleteAssets (assetIds: $assetIds) { success assets { id name deleted deleteState } } }', { assetIds })
    expect(success).to.be.true
    for (const a of assets) {
      expect(a.deleteState).to.equal('DELETED')
      expect(a.deleted).to.be.true
    }
  })
  it('should restore assets to the undeleted state', async () => {
    const { createSite: { site: siteE } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootAssetFolder { id } } } }', { name: 'assetTestSiteE', data: { templateKey: 'keyp1', savedAtVersion: '20231208120000', title: 'Site E Test Title' } })
    const siteEAssetRootId = siteE.rootAssetFolder.id
    const results = await Promise.all([
      postMultipart(`/assets/${siteEAssetRootId}`, {}, '/usr/app/files/blank.jpg', 'su01'),
      postMultipart(`/assets/${siteEAssetRootId}`, {}, '/usr/app/files/blankpdf.pdf', 'su01')
    ])
    const assetIds: string[] = [results[0].ids, results[1].ids].flat()
    await query('mutation DeleteAssets ($assetIds: [ID!]!) {deleteAssets (assetIds: $assetIds) { success assets { id name deleted deletedAt deletedBy { id firstname lastname } deleteState } } }', { assetIds })
    const { undeleteAssets: { success, assets } } = await query('mutation UndeleteAssets ($assetIds: [ID!]!) { undeleteAssets (assetIds: $assetIds) { success assets {id name deleted deleteState deletedAt } } }', { assetIds })
    expect(success).to.be.true
    for (const a of assets) {
      expect(a.deleteState).to.equal('NOTDELETED')
      expect(a.deleted).to.be.false
      expect(a.deletedAt).to.be.null
    }
  })
})
