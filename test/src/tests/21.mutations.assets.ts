/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, postMultipart } from '../common'
import { sleep } from 'txstate-utils'

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
  it('should move an asset folder', async () => {
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder8', testSiteAId, siteAAssetRootId)
    const { assetFolder: folder } = await createAssetFolder('grandchildfolder1', testSiteAId, siteAAssetRootId)
    expect(folder.folder.name).to.equal('assetTestSiteA')
    const { moveAssetFolder: { success, assetFolder } } = await query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: folder.id, targetId: targetFolder.id })
    expect(success).to.be.true
    expect(assetFolder.folder.id).to.equal(targetFolder.id)
  })
  it('should not allow the root asset folder to be moved', async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name assetroot { id } } } }', { args: { name: 'assetTestSiteB', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder9', site.id, site.assetroot.id)
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: siteAAssetRootId, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not move an asset folder below itself', async () => {
    const { assetFolder: movingFolder } = await createAssetFolder('childfolder10', testSiteAId, siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder11', testSiteAId, movingFolder.id)
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: movingFolder.id, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not allow an unauthorized user to move an asset folder', async () => {
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder12', testSiteAId, siteAAssetRootId)
    const { assetFolder: folder } = await createAssetFolder('grandchildfolder2', testSiteAId, siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetFolder (folderId: $folderId, targetId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: folder.id, targetId: targetFolder.id })).to.be.rejected
  })

  it('should create an asset', async () => {
    const uploadResult = await postMultipart('/assets', {}, '/usr/app/files/blank.jpg', 'su01')
    const upload = uploadResult[0]
    expect(upload.filename).to.equal('blank.jpg')
    expect(upload.mime).to.equal('image/jpeg')
    expect(upload.size).to.equal(75533)
    const { createAsset: { success, asset } } = await query(`
      mutation CreateAsset ($args: CreateAssetInput!) {
        createAsset (args: $args) {
          success
          asset {
            id
            name
            folder {
              id name
            }
            data
          }
        }
      }`, { args: { checksum: upload.shasum, name: upload.filename, folderId: siteAAssetRootId, size: upload.size, mime: upload.mime } })
    expect(success).to.be.true
  })
})
