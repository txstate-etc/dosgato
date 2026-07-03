import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, postMultipart } from '../common.js'
import { DateTime } from 'luxon'
import db from 'mysql2-async/db'

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
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${siteAAssetRootId}] }) { folders { name } } }`)
    expect(assetfolders[0].folders.map(f => f.name)).to.contain('childfolder1')
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
  it('should finalize an asset folder deletion', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder4a', siteAAssetRootId)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    const { finalizeAssetFolderDeletion: { success, assetFolder } } = await query('mutation finalizeAssetFolderDeletion ($folderId: ID!) { finalizeAssetFolderDeletion (folderId: $folderId) { success assetFolder { id name deleted deletedAt deleteState deletedBy { id } } } }', { folderId: folder.id })
    expect(success).to.be.true
    expect(assetFolder.deleted).to.be.true
    expect(assetFolder.deleteState).to.equal('DELETED')
    const updatedName = await db.getval<string>('SELECT name FROM assetfolders WHERE id = ?', [folder.id])
    const year = DateTime.now().year
    expect(updatedName?.startsWith(`${assetFolder.name}-${year}`))
  })
  it('should not rename child folders when finalizing an asset folder deletion', async () => {
    const { assetFolder: folder } = await createAssetFolder('childfolder4b', siteAAssetRootId)
    const { assetFolder: childFolder } = await createAssetFolder('subfolder', folder.id)
    await query('mutation DeleteAssetFolder ($folderId: ID!) { deleteAssetFolder (folderId: $folderId) { success assetFolder { id name deleted deletedAt deletedBy { id } } } }', { folderId: folder.id })
    const { finalizeAssetFolderDeletion: { assetFolder } } = await query('mutation finalizeAssetFolderDeletion ($folderId: ID!) { finalizeAssetFolderDeletion (folderId: $folderId) { success assetFolder { id name deleted deletedAt deleteState deletedBy { id } folders(filter: { deleteStates: [ALL] }) { id name deleteState } } } }', { folderId: folder.id })
    const deletedChild = assetFolder.folders[0]
    const nameAfterDelete = await db.getval<string>('SELECT name FROM assetfolders WHERE id = ?', [childFolder.id])
    expect(deletedChild.deleteState).to.equal('DELETED')
    expect(nameAfterDelete).to.equal(childFolder.name)
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
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetsAndFolders (folderIds: [$folderId], targetFolderId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: siteAAssetRootId, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not move an asset folder below itself', async () => {
    const { assetFolder: movingFolder } = await createAssetFolder('childfolder10', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder11', movingFolder.id)
    await expect(query('mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetsAndFolders (folderIds: [$folderId], targetFolderId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: movingFolder.id, targetId: targetFolder.id })).to.be.rejected
  })
  it('should not allow an unauthorized user to move an asset folder', async () => {
    const { assetFolder: targetFolder } = await createAssetFolder('childfolder12', siteAAssetRootId)
    const { assetFolder: folder } = await createAssetFolder('grandchildfolder2', siteAAssetRootId)
    await expect(queryAs('ed07', 'mutation MoveAssetFolder ($folderId: ID!, $targetId: ID!) { moveAssetsAndFolders (folderIds: [$folderId], targetFolderId: $targetId) { success assetFolder { id name folder { id name } } } }', { folderId: folder.id, targetId: targetFolder.id })).to.be.rejected
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
  it('should move an asset', async () => {
    const { assetFolder: sourceFolder } = await createAssetFolder('assetmovesource', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('assetmovetarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${sourceFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { moveAssetsAndFolders: { success, assetFolder } } = await query('mutation MoveAssets ($assetIds: [ID!], $targetFolderId: ID!) { moveAssetsAndFolders (assetIds: $assetIds, targetFolderId: $targetFolderId) { success assetFolder { id name } } }', { assetIds: ids, targetFolderId: targetFolder.id })
    expect(success).to.be.true
    expect(assetFolder.id).to.equal(targetFolder.id)
    const { assets } = await query('query getAssets ($ids: [ID!]!) { assets (filter: { ids: $ids }) { id filename folder { id } } }', { ids })
    expect(assets[0].folder.id).to.equal(targetFolder.id)
  })
  it('should copy an asset', async () => {
    const { assetFolder: sourceFolder } = await createAssetFolder('assetcopysource', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('assetcopytarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${sourceFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { copyAssetsAndFolders: { success, assetFolder } } = await query('mutation CopyAssets ($assetIds: [ID!], $targetFolderId: ID!) { copyAssetsAndFolders (assetIds: $assetIds, targetFolderId: $targetFolderId) { success assetFolder { id name } } }', { assetIds: ids, targetFolderId: targetFolder.id })
    expect(success).to.be.true
    expect(assetFolder.id).to.equal(targetFolder.id)
    const { assets: originals } = await query('query getAssets ($ids: [ID!]!) { assets (filter: { ids: $ids }) { id folder { id } } }', { ids })
    expect(originals[0].folder.id).to.equal(sourceFolder.id)
    const { assets: copies } = await query('query getAssets ($folderIds: [ID!]!) { assets (filter: { folderIds: $folderIds }) { id filename mime size checksum } }', { folderIds: [targetFolder.id] })
    expect(copies).to.have.lengthOf(1)
    expect(copies[0].id).to.not.equal(ids[0])
    expect(copies[0].filename).to.equal('blank.jpg')
    expect(copies[0].mime).to.equal('image/jpeg')
    expect(copies[0].size).to.equal(75533)
  })
  it('should copy an asset folder recursively', async () => {
    const { assetFolder: sourceFolder } = await createAssetFolder('foldercopysource', siteAAssetRootId)
    const { assetFolder: subFolder } = await createAssetFolder('foldercopysub', sourceFolder.id)
    const { assetFolder: targetFolder } = await createAssetFolder('foldercopytarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${sourceFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { copyAssetsAndFolders: { success } } = await query('mutation CopyAssetFolder ($folderIds: [ID!], $targetFolderId: ID!) { copyAssetsAndFolders (folderIds: $folderIds, targetFolderId: $targetFolderId) { success assetFolder { id name } } }', { folderIds: [sourceFolder.id], targetFolderId: targetFolder.id })
    expect(success).to.be.true
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${targetFolder.id}] }) { folders { id name assets { id filename } folders { id name } } } }`)
    const copiedFolder = assetfolders[0].folders[0]
    expect(copiedFolder.name).to.equal('foldercopysource')
    expect(copiedFolder.id).to.not.equal(sourceFolder.id)
    expect(copiedFolder.assets).to.have.lengthOf(1)
    expect(copiedFolder.assets[0].filename).to.equal('blank.jpg')
    expect(copiedFolder.assets[0].id).to.not.equal(ids[0])
    expect(copiedFolder.folders).to.have.lengthOf(1)
    expect(copiedFolder.folders[0].name).to.equal('foldercopysub')
    expect(copiedFolder.folders[0].id).to.not.equal(subFolder.id)
  })
  it('should move assets and folders together', async () => {
    const { assetFolder: sourceFolder } = await createAssetFolder('mixedmovesource', siteAAssetRootId)
    const { assetFolder: movingFolder } = await createAssetFolder('mixedmovefolder', sourceFolder.id)
    const { assetFolder: targetFolder } = await createAssetFolder('mixedmovetarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${sourceFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { moveAssetsAndFolders: { success } } = await query('mutation MoveAssetsAndFolders ($assetIds: [ID!], $folderIds: [ID!], $targetFolderId: ID!) { moveAssetsAndFolders (assetIds: $assetIds, folderIds: $folderIds, targetFolderId: $targetFolderId) { success assetFolder { id name } } }', { assetIds: ids, folderIds: [movingFolder.id], targetFolderId: targetFolder.id })
    expect(success).to.be.true
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${targetFolder.id}] }) { assets { id } folders { id } } }`)
    expect(assetfolders[0].assets.map(a => a.id)).to.have.members(ids)
    expect(assetfolders[0].folders.map(f => f.id)).to.have.members([movingFolder.id])
    const { assetfolders: sourceCheck } = await query(`{ assetfolders (filter: { ids: [${sourceFolder.id}] }) { assets { id } folders { id } } }`)
    expect(sourceCheck[0].assets).to.have.lengthOf(0)
    expect(sourceCheck[0].folders).to.have.lengthOf(0)
  })
  it('should copy assets and folders together', async () => {
    const { assetFolder: sourceFolder } = await createAssetFolder('mixedcopysource', siteAAssetRootId)
    const { assetFolder: copiedFolder } = await createAssetFolder('mixedcopyfolder', sourceFolder.id)
    const { assetFolder: targetFolder } = await createAssetFolder('mixedcopytarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${sourceFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { copyAssetsAndFolders: { success } } = await query('mutation CopyAssetsAndFolders ($assetIds: [ID!], $folderIds: [ID!], $targetFolderId: ID!) { copyAssetsAndFolders (assetIds: $assetIds, folderIds: $folderIds, targetFolderId: $targetFolderId) { success assetFolder { id name } } }', { assetIds: ids, folderIds: [copiedFolder.id], targetFolderId: targetFolder.id })
    expect(success).to.be.true
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${targetFolder.id}] }) { assets { id filename } folders { id name } } }`)
    expect(assetfolders[0].assets).to.have.lengthOf(1)
    expect(assetfolders[0].assets[0].filename).to.equal('blank.jpg')
    expect(assetfolders[0].assets[0].id).to.not.equal(ids[0])
    expect(assetfolders[0].folders).to.have.lengthOf(1)
    expect(assetfolders[0].folders[0].name).to.equal('mixedcopyfolder')
    expect(assetfolders[0].folders[0].id).to.not.equal(copiedFolder.id)
    const { assetfolders: sourceCheck } = await query(`{ assetfolders (filter: { ids: [${sourceFolder.id}] }) { assets { id } folders { id } } }`)
    expect(sourceCheck[0].assets.map(a => a.id)).to.have.members(ids)
    expect(sourceCheck[0].folders.map(f => f.id)).to.have.members([copiedFolder.id])
  })
  it('should not move an asset separately when its folder is also being moved', async () => {
    const { assetFolder: movingFolder } = await createAssetFolder('dedupmovefolder', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('dedupmovetarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${movingFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { moveAssetsAndFolders: { success } } = await query('mutation MoveAssetsAndFolders ($assetIds: [ID!], $folderIds: [ID!], $targetFolderId: ID!) { moveAssetsAndFolders (assetIds: $assetIds, folderIds: $folderIds, targetFolderId: $targetFolderId) { success } }', { assetIds: ids, folderIds: [movingFolder.id], targetFolderId: targetFolder.id })
    expect(success).to.be.true
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${targetFolder.id}] }) { assets { id } folders { id assets { id } } } }`)
    expect(assetfolders[0].assets).to.have.lengthOf(0)
    expect(assetfolders[0].folders).to.have.lengthOf(1)
    expect(assetfolders[0].folders[0].id).to.equal(movingFolder.id)
    expect(assetfolders[0].folders[0].assets.map(a => a.id)).to.have.members(ids)
  })
  it('should not copy an asset separately when its folder is also being copied', async () => {
    const { assetFolder: copiedFolder } = await createAssetFolder('dedupcopyfolder', siteAAssetRootId)
    const { assetFolder: targetFolder } = await createAssetFolder('dedupcopytarget', siteAAssetRootId)
    const { ids } = await postMultipart(`/assets/${copiedFolder.id}`, {}, '/usr/app/files/blank.jpg', 'su01')
    const { copyAssetsAndFolders: { success } } = await query('mutation CopyAssetsAndFolders ($assetIds: [ID!], $folderIds: [ID!], $targetFolderId: ID!) { copyAssetsAndFolders (assetIds: $assetIds, folderIds: $folderIds, targetFolderId: $targetFolderId) { success } }', { assetIds: ids, folderIds: [copiedFolder.id], targetFolderId: targetFolder.id })
    expect(success).to.be.true
    const { assetfolders } = await query(`{ assetfolders (filter: { ids: [${targetFolder.id}] }) { assets { id } folders { id assets { id } } } }`)
    expect(assetfolders[0].assets).to.have.lengthOf(0)
    expect(assetfolders[0].folders).to.have.lengthOf(1)
    expect(assetfolders[0].folders[0].id).to.not.equal(copiedFolder.id)
    expect(assetfolders[0].folders[0].assets).to.have.lengthOf(1)
    expect(assetfolders[0].folders[0].assets[0].id).to.not.equal(ids[0])
  })
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
