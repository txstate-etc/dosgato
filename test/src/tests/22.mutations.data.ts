/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

async function createDataFolder (name: string, templateKey: string, siteId?: string, username?: string) {
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
    }`, { args: { siteId, name, templateKey } })
  return { success, messages, dataFolder }
}

async function createDataEntry (name: string, templateKey: string, content: any, siteId?: string, folderId?: string, username?: string) {
  const { createDataEntry: { success, messages, data } } = await queryAs((username ?? 'su01'), `
    mutation CreateDataEntry ($args: CreateDataInput!) {
      createDataEntry (args: $args) {
        success
        messages { arg message type }
        data {
          id
          name
          data
          deleted
          deletedAt
          deletedBy {
            id
          }
          published
        }
      }
    }`, { args: { name, templateKey, schemaVersion: Date.now(), data: content, siteId, folderId } })
  return { success, messages, data }
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
  it('should create a global data entry', async () => {
    const { success, data } = await createDataEntry('GlobalBuilding1', 'keyd2', { name: 'Memorial Hall', floors: 3 })
    expect(success).to.be.true
    expect(data.name).to.equal('GlobalBuilding1')
    expect(data.data.floors).to.equal(3)
  })
  it('should create a data entry in a site', async () => {
    const { success, data } = await createDataEntry('SiteBuilding1', 'keyd2', { name: 'Alumni Center', floors: 2 }, '1')
    expect(success).to.be.true
    expect(data.name).to.equal('SiteBuilding1')
    expect(data.data.floors).to.equal(2)
    const { sites } = await query('{ sites(filter: { ids: [1] }) { id name data { name } } }')
    const siteData = sites[0].data
    expect(siteData).to.deep.include({ name: 'SiteBuilding1' })
  })
  it('should create a data entry in a folder', async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'datatestsite1', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { dataFolder: folder } = await createDataFolder('datafolderH', 'keyd2', site.id)
    const { success, data } = await createDataEntry('FolderBuilding1', 'keyd2', { name: 'Green Hall', floors: 5 }, site.id, folder.id)
    expect(success).to.be.true
    expect(data.name).to.equal('FolderBuilding1')
    const { sites } = await query(`{ sites(filter: { ids: [${site.id}] }) { id name datafolders { data { name } } } }`)
    const datafolder = sites[0].datafolders[0]
    expect(datafolder.data[0]).to.deep.include({ name: 'FolderBuilding1' })
  })
  it('should not allow an unauthorized user to create a date entry', async () => {
    await expect(createDataEntry('GlobalBuilding1', 'keyd2', { name: 'Memorial Hall', floors: 3 }, undefined, undefined, 'ed07')).to.be.rejected
  })
  it('should fail if the user tries to create a data entry with invalid data', async () => {
    const { success, messages } = await createDataEntry('WillFail', 'keyd1', { name: 'test' }, '1')
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
  })
  it('should rename a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding2', 'keyd2', { name: 'Violet Hall', floors: 3 })
    const { renameDataEntry: { success } } = await query(`
      mutation RenameDataEntry ($dataId: ID!, $name: String!) {
        renameDataEntry (dataId: $dataId, name: $name) {
          success
          data { id name }
        }
      }`, { name: 'RenamedGlobalBuilding2', dataId: dataEntry.id })
    expect(success).to.be.true
    const { data: entries } = await query(`{ data(filter: { ids: ["${dataEntry.id}"] }) { name } }`)
    expect(entries).to.deep.include({ name: 'RenamedGlobalBuilding2' })
  })
  it('should not allow an unauthorized user to rename a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding3', 'keyd2', { name: 'Limestone Center', floors: 2 })
    await expect(queryAs('ed07', `
      mutation RenameDataEntry ($dataId: ID!, $name: String!) {
        renameDataEntry (dataId: $dataId, name: $name) {
          success
          data { id name }
        }
      }`, { name: 'RenamedGlobalBuilding3', dataId: dataEntry.id })).to.be.rejected
  })
  it('should update a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding4', 'keyd2', { name: 'Stoodent Building', floors: 3 })
    const { updateDataEntry: { success, data } } = await query(`
      mutation UpdateDataEntry ($dataId: ID!, $args: UpdateDataInput!) {
        updateDataEntry (dataId: $dataId, args: $args) {
          success
          data {
            id
            name
            data
          }
        }
      }
    `, { dataId: dataEntry.id, args: { schemaVersion: Date.now(), data: { name: 'Student Building', floors: 3, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Fix spelling error' } })
    expect(success).to.be.true
    expect(data.data.name).to.equal('Student Building')
  })
  it('should fail if invalid data is sent to an update', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding5', 'keyd2', { name: 'Oak Hall', floors: 1 })
    const { updateDataEntry: { success, messages } } = await query(`
      mutation UpdateDataEntry ($dataId: ID!, $args: UpdateDataInput!) {
        updateDataEntry (dataId: $dataId, args: $args) {
          success
          messages {
            message
          }
        }
      }
    `, { dataId: dataEntry.id, args: { schemaVersion: Date.now(), data: { name: 'Oak Hall', floors: 8, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Building remodled' } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to update a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding6', 'keyd2', { name: 'Mispeled Building', floors: 3 })
    await expect(queryAs('', `
    mutation UpdateDataEntry ($dataId: ID!, $args: UpdateDataInput!) {
      updateDataEntry (dataId: $dataId, args: $args) {
        success
      }
    }
  `, { dataId: dataEntry.id, args: { schemaVersion: Date.now(), data: { name: 'Building', floors: 6, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Should not work' } })).to.be.rejected
  })
  it('should publish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding7', 'keyd2', { name: 'James Hall', floors: 2 })
    const { publishDataEntry: { success } } = await query(`
      mutation PublishDataEntry ($dataId: ID!) {
        publishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.true
    }
  })
  it('should not allow an unauthorized user to publish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding8', 'keyd2', { name: 'Allen Hall', floors: 2 })
    await expect(queryAs('ed07', `
      mutation PublishDataEntry ($dataId: ID!) {
        publishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })).to.be.rejected
  })
  it('should unpublish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding9', 'keyd2', { name: 'Pineapple Center', floors: 2 })
    await query(`
      mutation PublishDataEntry ($dataId: ID!) {
        publishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })
    const { unpublishDataEntry: { success } } = await query(`
      mutation UnpublishDataEntry ($dataId: ID!) {
        unpublishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.false
    }
  })
  it('should not allow an unauthorized user to unpublish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding10', 'keyd2', { name: 'Clock Tower', floors: 4 })
    await query(`
      mutation PublishDataEntry ($dataId: ID!) {
        publishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })
    await expect(queryAs('ed07', `
      mutation UnpublishDataEntry ($dataId: ID!) {
        unpublishDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })).to.be.rejected
  })
  it('should delete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding11', 'keyd2', { name: 'State Building', floors: 2 })
    const { deleteDataEntry: { success, data } } = await query(`
      mutation DeleteDataEntry ($dataId: ID!) {
        deleteDataEntry (dataId: $dataId) {
          success
          data {
            deleted
            deletedAt
            deletedBy {
              id
            }
          }
        }
      }
    `, { dataId: dataEntry.id })
    expect(success).to.be.true
    expect(data.deleted).to.be.true
    expect(data.deletedAt).to.not.be.null
    expect(data.deletedBy.id).to.equal('su01')
  })
  it('should not allow an unauthorized user to delete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding12', 'keyd2', { name: 'Large Donation Hall', floors: 2 })
    await expect(queryAs('ed07', `
      mutation DeleteDataEntry ($dataId: ID!) {
        deleteDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })).to.be.rejected
  })
  it('should undelete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding13', 'keyd2', { name: 'Equipment Shed', floors: 1 })
    await query(`
      mutation DeleteDataEntry ($dataId: ID!) {
        deleteDataEntry (dataId: $dataId) {
          success
        }
      }`, { dataId: dataEntry.id })
    const { undeleteDataEntry: { success, data } } = await query(`
      mutation UndeleteDataEntry ($dataId: ID!) {
        undeleteDataEntry (dataId: $dataId) {
          success
          data {
            deleted
            deletedAt
            deletedBy
          }
        }
      }
    `, { dataId: dataEntry.id })
    expect(success).to.be.true
    expect(data.deleted).to.be.false
    expect(data.deletedAt).to.be.null
    expect(data.deletedBy).to.be.null
  })
  it('should not allow an unauthorized user to undelete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry('GlobalBuilding14', 'keyd2', { name: 'Bobcat Center', floors: 4 })
    await query(`
      mutation UndeleteDataEntry ($dataId: ID!) {
        undeleteDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })
    await expect(queryAs('ed07', `
      mutation UndeleteDataEntry ($dataId: ID!) {
        undeleteDataEntry (dataId: $dataId) {
          success
        }
      }
    `, { dataId: dataEntry.id })).to.be.rejected
  })
  it.skip('should move data within a data folder', async () => {})
  it.skip('should move data out of a folder to a site', async () => {})
  it.skip('should move data out of a folder to global data', async () => {})
  it.skip('should move site-level data within a site', async () => {})
  it.skip('should move site-level data to a folder', async () => {})
  it.skip('should move site-level data to global data', async () => {})
  it.skip('should update the display order of global data', async () => {})
  it.skip('should move global data to a folder', async () => {})
  it.skip('should move data from global data to a site', async () => {})
  it.skip('should move data from one folder to another', async () => {})
  it.skip('should move data from one site to another', async () => {})
})
