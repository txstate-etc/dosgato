/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

async function createDataFolder (name: string, templateId: string, siteId?: string, username?: string) {
  const { createDataFolder: { success, messages, dataFolder } } = await queryAs((username ?? 'su01'), `
    mutation CreateDataFolder ($args: CreateDataFolderInput!) {
      createDataFolder (args: $args) {
        success
        messages { message }
        dataFolder {
          id
          name
          folder { id name }
        }
      }
    }`, { args: { siteId, name, templateId } })
  return { success, messages, dataFolder }
}

describe('data mutations', () => {
  let dataTemplate1Id
  before(async () => {})
  it('should create a data folder', async () => {
    const { success, dataFolder } = await createDataFolder('datafolderA', 'keyd1')
    expect(success).to.be.true
    expect(dataFolder.name).to.equal('datafolderA')
  })
  it('should not allow an unauthorized user to create a data folder', async () => {
    await expect(createDataFolder('test', 'keyd1', 'ed07')).to.be.rejected
  })
  it('should rename a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderB', 'keyd1')
    const { renameDataFolder: { success, dataFolder } } = await query(`
    mutation RenameDataFolder ($folderId: ID!, $name: String!) {
      renameDataFolder (folderId: $folderId, name: $name) {
        success
        dataFolder { id name }
      }
    }`, { folderId: folder.id, name: 'RenamedDataFolderB' })
    expect(success).to.be.true
    expect(dataFolder.name).to.equal('RenamedDataFolderB')
  })
  it('should not allow an unauthorized user to rename a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderC', 'keyd1')
    await expect(queryAs('ed07', `
    mutation RenameDataFolder ($folderId: ID!, $name: String!) {
      renameDataFolder (folderId: $folderId, name: $name) {
        success
        dataFolder { id name }
      }
    }`, { folderId: folder.id, name: 'RenamedDataFolderB' })).to.be.rejected
  })
  it('should delete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderD', 'keyd1')
    const { deleteDataFolder: { success, dataFolder } } = await query(`
      mutation DeleteDataFolder ($folderId: ID!) {
        deleteDataFolder (folderId: $folderId) {
          success
          dataFolder {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderId: folder.id })
    expect(success).to.be.true
    expect(dataFolder.deleted).to.be.true
    expect(dataFolder.deletedBy.id).to.equal('su01')
    expect(dataFolder.deletedAt).to.not.be.null
  })
  it('should not allow an unauthorized user to delete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderE', 'keyd1')
    await expect(queryAs('ed07', `
    mutation DeleteDataFolder ($folderId: ID!) {
      deleteDataFolder (folderId: $folderId) {
        success
      }
    }`, { folderId: folder.id })).to.be.rejected
  })
  it('should undelete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderF', 'keyd1')
    await query(`
      mutation DeleteDataFolder ($folderId: ID!) {
        deleteDataFolder (folderId: $folderId) {
          success
          dataFolder {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderId: folder.id })
    const { undeleteDataFolder: { success, dataFolder } } = await query(`
      mutation UndeleteDataFolder ($folderId: ID!) {
        undeleteDataFolder (folderId: $folderId) {
          success
          dataFolder {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderId: folder.id })
    expect(success).to.be.true
    expect(dataFolder.deleted).to.be.false
    expect(dataFolder.deletedBy).to.be.null
    expect(dataFolder.deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderG', 'keyd1')
    await query(`
      mutation DeleteDataFolder ($folderId: ID!) {
        deleteDataFolder (folderId: $folderId) {
          success
          dataFolder {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderId: folder.id })
    await expect(queryAs('ed07', `
      mutation UndeleteDataFolder ($folderId: ID!) {
        undeleteDataFolder (folderId: $folderId) {
          success
        }
      }`, { folderId: folder.id })).to.be.rejected
  })
})
