/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import db from 'mysql2-async/db'
import { DateTime } from 'luxon'
import { groupby } from 'txstate-utils'

chai.use(chaiAsPromised)

async function createSite (name: string) {
  const resp = await query(`
    mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) {
      createSite (name: $name, data: $data) {
        success
        site { id name }
      }
    }`, { name, data: { savedAtVersion: '20220901120000', templateKey: 'keyp1', title: 'Test Title' } })
  return resp.createSite.site
}

async function createDataFolder (name: string, templateKey: string, siteId?: string, username?: string) {
  const { createDataFolder: { success, messages, dataFolder } } = await queryAs((username ?? 'su01'), `
    mutation CreateDataFolder ($args: CreateDataFolderInput!) {
      createDataFolder (args: $args) {
        success
        messages { message }
        dataFolder {
          id
          name
        }
      }
    }`, { args: { siteId, name, templateKey } })
  return { success, messages, dataFolder }
}

async function createDataEntry (content: any, siteId?: string, folderId?: string, username?: string) {
  content.savedAtVersion = '20220710120000'
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
    }`, { args: { data: content, siteId, folderId } })
  return { success, messages, data }
}

async function moveDataEntries (dataIds: string[], aboveTarget?: string, folderId?: string, siteId?: string) {
  const { moveDataEntries: { success, data, messages } } = await query(`
    mutation MoveDataEntries ($dataIds: [ID!]!, $target: MoveDataTarget!) {
      moveDataEntries (dataIds: $dataIds, target: $target) {
        success
        messages { arg message type }
        data {
          id
          name
          site { id name deletedAt }
          template { deleted }
          folder { id name }
        }
      }
    }`, { dataIds, target: { aboveTarget, folderId, siteId } })
  return { success, messages, data }
}

describe('data mutations', () => {
  let datatestsite1Id: string
  let datatestsite2Id: string
  before(async () => {
    const site1 = await createSite('datatestsite1')
    const site2 = await createSite('datatestsite2')
    datatestsite1Id = site1.id
    datatestsite2Id = site2.id
  })
  it('should create a data folder', async () => {
    const { success, dataFolder } = await createDataFolder('datafolder-a', 'keyd1')
    expect(success).to.be.true
    expect(dataFolder.name).to.equal('datafolder-a')
  })
  it('should not allow an unauthorized user to create a data folder', async () => {
    await expect(createDataFolder('test', 'keyd1', undefined, 'ed07')).to.be.rejected
  })
  it('should rename a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-b', 'keyd1')
    const { renameDataFolder: { success, dataFolder } } = await query(`
    mutation RenameDataFolder ($folderId: ID!, $name: UrlSafeString!) {
      renameDataFolder (folderId: $folderId, name: $name) {
        success
        dataFolder { id name }
      }
    }`, { folderId: folder.id, name: 'renamed-datafolder-b' })
    expect(success).to.be.true
    expect(dataFolder.name).to.equal('renamed-datafolder-b')
  })
  it('should not allow an unauthorized user to rename a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-c', 'keyd1')
    await expect(queryAs('ed07', `
    mutation RenameDataFolder ($folderId: ID!, $name: UrlSafeString!) {
      renameDataFolder (folderId: $folderId, name: $name) {
        success
        dataFolder { id name }
      }
    }`, { folderId: folder.id, name: 'renamed-datafolder-b' })).to.be.rejected
  })
  it('should delete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-d', 'keyd1')
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd1', title: 'Delete Me', color: 'orangish', align: 'center' }, undefined, folder.id)
    const { deleteDataFolders: { success, dataFolders } } = await query(`
      mutation DeleteDataFolders ($folderIds: [ID!]!) {
        deleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderIds: [folder.id] })
    expect(success).to.be.true
    expect(dataFolders[0].deleted).to.be.true
    expect(dataFolders[0].deletedBy.id).to.equal('su01')
    expect(dataFolders[0].deletedAt).to.not.be.null
    const { data } = await query(`{ data (filter: { folderIds: ["${folder.id}"], deleteStates: [ALL]}){ name deleted }}`)
    expect(data[0].name).to.satisfy(s => s.startsWith('delete-me'))
    expect(data[0].deleted).to.be.true
  })
  it('should not allow an unauthorized user to delete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-e', 'keyd1')
    await expect(queryAs('ed07', `
    mutation DeleteDataFolders ($folderIds: [ID!]!) {
      deleteDataFolders (folderIds: $folderIds) {
        success
      }
    }`, { folderIds: [folder.id] })).to.be.rejected
  })
  it('should undelete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-f', 'keyd1')
    await query(`
      mutation DeleteDataFolders ($folderIds: [ID!]!) {
        deleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderIds: [folder.id] })
    const { undeleteDataFolders: { success, dataFolders } } = await query(`
      mutation UndeleteDataFolders ($folderIds: [ID!]!) {
        undeleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderIds: [folder.id] })
    expect(success).to.be.true
    expect(dataFolders[0].deleted).to.be.false
    expect(dataFolders[0].deletedBy).to.be.null
    expect(dataFolders[0].deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-g', 'keyd1')
    await query(`
      mutation DeleteDataFolders ($folderIds: [ID!]!) {
        deleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            id
            name
            deleted
            deletedAt
            deletedBy { id }
          }
        }
      }`, { folderIds: [folder.id] })
    await expect(queryAs('ed07', `
      mutation UndeleteDataFolders ($folderIds: [ID!]!) {
        undeleteDataFolders (folderIds: $folderIds) {
          success
        }
      }`, { folderIds: [folder.id] })).to.be.rejected
  })
  it('should republish data in a folder when undeleting the folder for a data template where the nopublish flag is set to true', async () => {
    const { dataFolder: folder } = await createDataFolder('song-folder', 'songdatakey')
    const { data: dataEntry1 } = await createDataEntry({ templateKey: 'songdatakey', title: 'Teardrops On My Guitar', artist: 'Taylor Swift', genre: 'country' }, undefined, folder.id)
    const { data: dataEntry2 } = await createDataEntry({ templateKey: 'songdatakey', title: 'Our Song', artist: 'Taylor Swift', genre: 'country' }, undefined, folder.id)
    const { deleteDataFolders: { dataFolders } } = await query(`
      mutation DeleteDataFolders ($folderIds: [ID!]!) {
        deleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            data {
              published
            }
          }
        }
      }`, { folderIds: [folder.id] })
    for (const d of dataFolders[0].data) {
      expect(d.published).to.be.false
    }
    const { undeleteDataFolders: { dataFolders: undeletedFolders } } = await query(`
      mutation UndeleteDataFolders ($folderIds: [ID!]!) {
        undeleteDataFolders (folderIds: $folderIds) {
          success
          dataFolders {
            data {
              published
            }
          }
        }
      }`, { folderIds: [folder.id] })
    for (const d of undeletedFolders[0].data) {
      expect(d.published).to.be.true
    }
  })
  it('should move global data folders to a site', async () => {
    const { dataFolder: folder1 } = await createDataFolder('moving-datafolder-1', 'keyd1')
    const { dataFolder: folder2 } = await createDataFolder('moving-datafolder-2', 'keyd1')
    const { moveDataFolders: { success } } = await query(`
      mutation MoveDataFolders ($folderIds: [ID!]!, $siteId: ID) {
        moveDataFolders (folderIds: $folderIds, siteId: $siteId) {
          success
        }
      }`, { folderIds: [folder1.id, folder2.id], siteId: datatestsite2Id })
    expect(success).to.be.true
    const { datafolders } = await query(`{ datafolders(filter: { siteIds: ["${datatestsite2Id}"] }) { id name } }`)
    expect(datafolders.map((f: any) => f.id)).to.include.members([folder1.id, folder2.id])
  })
  it('should make site-level data folders global', async () => {
    const { dataFolder: folder1 } = await createDataFolder('movingDataFolder3', 'keyd1', datatestsite2Id)
    const { dataFolder: folder2 } = await createDataFolder('movingDataFolder4', 'keyd1', datatestsite2Id)
    const { moveDataFolders: { success } } = await query(`
      mutation MoveDataFolders ($folderIds: [ID!]!, $siteId: ID) {
        moveDataFolders (folderIds: $folderIds, siteId: $siteId) {
          success
        }
      }`, { folderIds: [folder1.id, folder2.id] })
    expect(success).to.be.true
    const { datafolders } = await query('{ datafolders(filter: { global: true }) { id name } }')
    expect(datafolders.map((d: any) => d.id)).to.include.members([folder1.id, folder2.id])
  })
  it('should not create a new data folder if validateOnly=true', async () => {
    const { createDataFolder: { success } } = await query(`
    mutation CreateDataFolder ($args: CreateDataFolderInput!, $validateOnly: Boolean) {
      createDataFolder (args: $args, validateOnly: $validateOnly) {
        success
      }
    }`, { args: { name: 'validfoldername', templateKey: 'keyd1' }, validateOnly: true })
    expect(success).to.be.true
    const { datafolders } = await query('{ datafolders (filter: { templateKeys: ["keyd1"] }) { id name } }')
    expect(datafolders.map(f => f.name)).to.not.include(['validfoldername'])
  })
  it('should create a global data entry', async () => {
    const { success, data } = await createDataEntry({ templateKey: 'keyd2', name: 'Memorial Hall', floors: 3 })
    expect(success).to.be.true
    expect(data.name).to.equal('memorial-hall')
    expect(data.data.floors).to.equal(3)
  })
  it('should create a data entry in a site', async () => {
    const { success, data } = await createDataEntry({ templateKey: 'keyd2', name: 'Alumni Center', floors: 2 }, '1')
    expect(success).to.be.true
    expect(data.name).to.equal('alumni-center')
    expect(data.data.floors).to.equal(2)
    const { data: siteData } = await query('{ data(filter: { siteIds: ["1"] }) { name } }')
    expect(siteData).to.deep.include({ name: 'alumni-center' })
  })
  it('should create a data entry in a folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolder-h', 'keyd2', datatestsite1Id)
    const { success, data } = await createDataEntry({ templateKey: 'keyd2', name: 'Green Hall', floors: 5 }, datatestsite1Id, folder.id)
    expect(success).to.be.true
    expect(data.name).to.equal('green-hall')
    const { datafolders } = await query(`{ datafolders (filter: { siteIds: ["${datatestsite1Id}"], templateKeys: ["keyd2"] }) { name data { name } } }`)
    const datafolder = datafolders.find(f => f.name === 'datafolder-h')
    expect(datafolder.data[0]).to.deep.include({ name: 'green-hall' })
  })
  it('should not allow an unauthorized user to create a date entry', async () => {
    await expect(createDataEntry({ templateKey: 'keyd2', name: 'Memorial Hall', floors: 3 }, undefined, undefined, 'ed07')).to.be.rejected
  })
  it('should fail if the user tries to create a data entry with invalid data', async () => {
    const { success, messages } = await createDataEntry({ templateKey: 'keyd1', name: 'willfail' }, '1')
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
  })
  it('should update a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Stoodent Building', floors: 3 })
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
    `, { dataId: dataEntry.id, args: { data: { ...dataEntry.data, name: 'Student Building', floors: 3, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Fix spelling error' } })
    expect(success).to.be.true
    expect(data.data.name).to.equal('Student Building')
  })
  it('should fail if invalid data is sent to an update', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Oak Hall', floors: 1 })
    const { updateDataEntry: { success, messages } } = await query(`
      mutation UpdateDataEntry ($dataId: ID!, $args: UpdateDataInput!) {
        updateDataEntry (dataId: $dataId, args: $args) {
          success
          messages {
            message
          }
        }
      }
    `, { dataId: dataEntry.id, args: { data: { ...dataEntry.data, name: 'Oak Hall', floors: 8, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Building remodled' } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to update a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Mispeled Building', floors: 3 })
    await expect(queryAs('', `
    mutation UpdateDataEntry ($dataId: ID!, $args: UpdateDataInput!) {
      updateDataEntry (dataId: $dataId, args: $args) {
        success
      }
    }
  `, { dataId: dataEntry.id, args: { data: { ...dataEntry.data, name: 'Building', floors: 6, templateKey: 'keyd2' }, dataVersion: 1, comment: 'Should not work' } })).to.be.rejected
  })
  it('should publish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'James Hall', floors: 2 })
    const { publishDataEntries: { success } } = await query(`
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.true
    }
  })
  it('should publish multiple data entries', async () => {
    const { data: dataEntry1 } = await createDataEntry({ templateKey: 'keyd2', name: 'Woods Hall', floors: 2 })
    const { data: dataEntry2 } = await createDataEntry({ templateKey: 'keyd2', name: 'Waterfall Hall', floors: 2 })
    const { publishDataEntries: { success } } = await query(`
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry1.id}","${dataEntry2.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.true
    }
  })
  it('should not allow an unauthorized user to publish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Allen Hall', floors: 2 })
    await expect(queryAs('ed07', `
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })).to.be.rejected
  })
  it('should unpublish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Pineapple Center', floors: 2 })
    await query(`
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    const { unpublishDataEntries: { success } } = await query(`
      mutation UnpublishDataEntries ($dataIds: [ID!]!) {
        unpublishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.false
    }
  })
  it('should unpublish multiple data entries', async () => {
    const { data: dataEntry1 } = await createDataEntry({ templateKey: 'keyd2', name: 'Mountain Hall', floors: 1 })
    const { data: dataEntry2 } = await createDataEntry({ templateKey: 'keyd2', name: 'Cedar Hall', floors: 3 })
    await query(`
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    const { unpublishDataEntries: { success } } = await query(`
      mutation UnpublishDataEntries ($dataIds: [ID!]!) {
        unpublishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry1.id}","${dataEntry2.id}"] }) { published } }`)
    for (const d of data) {
      expect(d.published).to.be.false
    }
  })
  it('should not allow an unauthorized user to unpublish a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Clock Tower', floors: 4 })
    await query(`
      mutation PublishDataEntries ($dataIds: [ID!]!) {
        publishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    await expect(queryAs('ed07', `
      mutation UnpublishDataEntries ($dataIds: [ID!]!) {
        unpublishDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })).to.be.rejected
  })
  it('should delete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'State Building', floors: 2 })
    const { deleteDataEntries: { success, data } } = await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
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
    `, { dataIds: [dataEntry.id] })
    expect(success).to.be.true
    expect(data[0].deleted).to.be.true
    expect(data[0].deletedAt).to.not.be.null
    expect(data[0].deletedBy.id).to.equal('su01')
  })
  it('should delete multiple data entries', async () => {
    const { data: dataEntry1 } = await createDataEntry({ templateKey: 'keyd2', name: 'Alabama Building', floors: 2 })
    const { data: dataEntry2 } = await createDataEntry({ templateKey: 'keyd2', name: 'Alaska Building', floors: 2 })
    const { deleteDataEntries: { success } } = await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
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
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry1.id}","${dataEntry2.id}"] }) { deleted } }`)
    for (const d of data) {
      expect(d.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to delete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Large Donation Hall', floors: 2 })
    await expect(queryAs('ed07', `
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })).to.be.rejected
  })
  it('should undelete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Equipment Shed', floors: 1 })
    await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
          success
        }
      }`, { dataIds: [dataEntry.id] })
    const { undeleteDataEntries: { success, data } } = await query(`
      mutation UndeleteDataEntries ($dataIds: [ID!]!) {
        undeleteDataEntries (dataIds: $dataIds) {
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
    `, { dataIds: [dataEntry.id] })
    expect(success).to.be.true
    expect(data[0].deleted).to.be.false
    expect(data[0].deletedAt).to.be.null
    expect(data[0].deletedBy).to.be.null
  })
  it('should undelete multiple data entries', async () => {
    const { data: dataEntry1 } = await createDataEntry({ templateKey: 'keyd2', name: 'Wild Rice Hall', floors: 2 })
    const { data: dataEntry2 } = await createDataEntry({ templateKey: 'keyd2', name: 'Blind Salamander Building', floors: 2 })
    await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
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
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    const { undeleteDataEntries: { success } } = await query(`
      mutation UndeleteDataEntries ($dataIds: [ID!]!) {
        undeleteDataEntries (dataIds: $dataIds) {
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
    `, { dataIds: [dataEntry1.id, dataEntry2.id] })
    expect(success).to.be.true
    const { data } = await query(`{ data(filter: {ids: ["${dataEntry1.id}","${dataEntry2.id}"] }) { deleted } }`)
    for (const d of data) {
      expect(d.deleted).to.be.false
    }
  })
  it('should not allow an unauthorized user to undelete a data entry', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'keyd2', name: 'Bobcat Center', floors: 4 })
    await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    await expect(queryAs('ed07', `
      mutation UndeleteDataEntries ($dataIds: [ID!]!) {
        undeleteDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })).to.be.rejected
  })
  it('should move data within a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderJ', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Silver Text', color: 'silver', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Gold Text', color: 'gold', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Bronze Text', color: 'bronze', align: 'center' }, datatestsite1Id, folder.id)
    const { success } = await moveDataEntries([data2.id], data1.id, undefined, datatestsite1Id)
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data2.id, data1.id, data3.id])
  })
  it('should move data out of a folder to a site', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderK', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Blue Text', color: 'blue', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Green Text', color: 'green', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Purple Text', color: 'purple', align: 'center' }, datatestsite1Id, folder.id)
    const { success, data } = await moveDataEntries([data2.id], undefined, undefined, datatestsite2Id)
    expect(data[0].folder).to.be.null
    expect(data[0].site.id).to.equal(datatestsite2Id)
    expect(success).to.be.true
    const { data: data4 } = await query(`{ data (filter: {siteIds: ["${datatestsite2Id}"]}) { name } }`)
    expect(data4.map((d: any) => d.name)).to.include('green-text')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folder.id])
    expect(String(remaining[1].dataId)).to.equal(data3.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move data out of a folder to global data', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderL', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Yellow Text', color: 'yellow', align: 'left' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Orange Text', color: 'orange', align: 'left' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Red Text', color: 'red', align: 'left' }, datatestsite1Id, folder.id)
    const { success } = await moveDataEntries([data1.id])
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    expect(globaldata.map((d: any) => d.name)).to.include('yellow-text')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folder.id])
    expect(String(remaining[0].dataId)).to.equal(data2.id)
    expect(remaining[0].displayOrder).to.equal(1)
  })
  it('should move site-level data within a site', async () => {
    const site = await createSite('datatestsite3')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Medium Gray Text', color: 'mdgray', align: 'left' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Dark Gray Text', color: 'dkgray', align: 'left' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Light Gray Text', color: 'ltgray', align: 'left' }, site.id)
    const { success } = await moveDataEntries([data3.id], data1.id)
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {siteIds: [${site.id}]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id, data2.id])
  })
  it('should move site-level data to a folder', async () => {
    const site = await createSite('datatestsite4')
    const { dataFolder: folder } = await createDataFolder('datafolderM', 'keyd1', site.id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Pink Text', color: 'pink', align: 'right' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Lavender Text', color: 'lavender', align: 'right' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Cream Text', color: 'cream', align: 'right' }, site.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Mint Text', color: 'mint', align: 'right' }, site.id)
    const { success } = await moveDataEntries([data2.id], undefined, folder.id)
    expect(success).to.be.true
    await moveDataEntries([data4.id], data2.id)
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data4.id, data2.id])
    const remaining = await db.getall('SELECT dataId, displayOrder FROM data WHERE folderId IS NULL and siteId = ?', [site.id])
    expect(String(remaining[1].dataId)).to.equal(data3.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move site-level data to global data', async () => {
    const site = await createSite('datatestsite5')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Black Text', color: 'black', align: 'center' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Brown Text', color: 'brown', align: 'right' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Lime Text', color: 'lime', align: 'left' }, site.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Cyan Text', color: 'cyan', align: 'right' }, site.id)
    const { success } = await moveDataEntries([data3.id])
    expect(success).to.be.true
    await moveDataEntries([data1.id], data3.id)
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    const globaldatanames = globaldata.map((d: any) => d.name)
    expect(globaldatanames).to.include('lime-text')
    const position: number = globaldatanames.indexOf('lime-text')
    expect(globaldatanames.indexOf('black')).to.be.lessThan(position)
    const remaining = await db.getall('SELECT dataId, displayOrder FROM data WHERE folderId IS NULL AND siteId = ?', [site.id])
    expect(String(remaining[1].dataId)).to.equal(data4.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should update the display order of global data', async () => {
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Maroon Text', color: 'maroon', align: 'center' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Magenta Text', color: 'magenta', align: 'right' })
    const { success } = await moveDataEntries([data2.id], data1.id)
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    const globaldatanames = globaldata.map((d: any) => d.name)
    expect(globaldatanames).to.include('lime-text')
    expect(globaldatanames.indexOf('magenta-text')).to.be.lessThan(globaldatanames.indexOf('maroon-text'))
  })
  it('should move global data to a folder', async () => {
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Raspberry Text', color: 'raspberry', align: 'center' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Cherry Text', color: 'cherry', align: 'right' })
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Mauve Text', color: 'mauve', align: 'right' })
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Sky Blue Text', color: 'skyblue', align: 'right' })
    const { dataFolder: folder } = await createDataFolder('datafolderN', 'keyd1', datatestsite2Id)
    const { success } = await moveDataEntries([data1.id], undefined, folder.id)
    expect(success).to.be.true
    await moveDataEntries([data3.id], data1.id)
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id])
  })
  it('should move data from global data to a site', async () => {
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Teal Text', color: 'teal', align: 'center' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Tangerine Text', color: 'tangerine', align: 'right' })
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Navy Text', color: 'navy', align: 'left' })
    const site = await createSite('datatestsite6')
    const { success } = await moveDataEntries([data1.id], undefined, undefined, site.id)
    expect(success).to.be.true
    const { data: data4 } = await query(`{ data (filter: {siteIds: ["${site.id}"]}) { name } }`)
    expect(data4.map((d: any) => d.name)).to.include('teal-text')
  })
  it('should move data from one folder to another', async () => {
    const { dataFolder: folderO } = await createDataFolder('datafolderO', 'keyd1', datatestsite2Id)
    const { dataFolder: folderP } = await createDataFolder('datafolderP', 'keyd1', datatestsite2Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Evergreen Text', color: 'evergreen', align: 'center' }, undefined, folderO.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Lemon Text', color: 'lemon', align: 'right' }, undefined, folderO.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Olive Text', color: 'olive', align: 'right' }, undefined, folderO.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Indigo Text', color: 'indigo', align: 'left' }, undefined, folderP.id)
    const { success } = await moveDataEntries([data2.id], undefined, folderP.id)
    expect(success).to.be.true
    const { data: sortedDataO } = await query(`{ data(filter: {folderIds: ["${folderO.id}"]}) { id } }`)
    expect(sortedDataO.map((d: any) => d.id)).to.have.ordered.members([data1.id, data3.id])
    const { data: sortedDataP } = await query(`{ data(filter: {folderIds: ["${folderP.id}"]}) { id } }`)
    expect(sortedDataP.map((d: any) => d.id)).to.have.ordered.members([data4.id, data2.id])
  })
  it('should move data from one site to another', async () => {
    const site7 = await createSite('datatestsite7')
    const site8 = await createSite('datatestsite8')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Hot Pink Text', color: 'hotpink', align: 'center' }, site7.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Rose Text', color: 'rose', align: 'right' }, site7.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Tomato Text', color: 'tomato', align: 'right' }, site7.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Brick Text', color: 'brick', align: 'left' }, site8.id)
    const { success } = await moveDataEntries([data2.id], undefined, undefined, site8.id)
    expect(success).to.be.true
    const { data: data5 } = await query(`{ data (filter: {siteIds: ["${site7.id}", "${site8.id}"]}) { name, site { id } } }`)
    const dataBySite = groupby(data5, 'site.id')
    expect(dataBySite[site7.id].map((d: any) => d.name)).to.include.members(['hot-pink-text', 'tomato-text'])
    expect(dataBySite[site8.id].map((d: any) => d.name)).to.include.members(['rose-text', 'brick-text'])
  })
  it('should move multiple data entries within a data folder', async () => {
    const { dataFolder: folderQ } = await createDataFolder('datafolderQ', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Snow Text', color: 'snow', align: 'left' }, undefined, folderQ.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Light Pink Text', color: 'lightpink', align: 'left' }, undefined, folderQ.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Dark Pink Text', color: 'darkpink', align: 'left' }, undefined, folderQ.id)
    const { success } = await moveDataEntries([data2.id, data3.id], data1.id)
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folderQ.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data2.id, data3.id, data1.id])
  })
  it('should move multiple data entries out of a folder to a site', async () => {
    const { dataFolder: folderR } = await createDataFolder('datafolderR', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Amaranth Text', color: 'amaranth', align: 'left' }, undefined, folderR.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Amber Text', color: 'amber', align: 'left' }, undefined, folderR.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Amethyst Text', color: 'amethyst', align: 'left' }, undefined, folderR.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Apricot Text', color: 'apricot', align: 'left' }, undefined, folderR.id)
    const { success } = await moveDataEntries([data2.id, data3.id], undefined, undefined, datatestsite2Id)
    expect(success).to.be.true
    const { data: data5 } = await query(`{ data(filter: {siteIds: ["${datatestsite2Id}"]}) { name } }`)
    expect(data5.map((d: any) => d.name)).to.include('amber-text')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folderR.id])
    expect(String(remaining[1].dataId)).to.equal(data4.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move multiple data entries out of a folder to global data', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderS', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Aquamarine Text', color: 'aquamarine', align: 'left' }, undefined, folder.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Azure Text', color: 'azure', align: 'left' }, undefined, folder.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Baby Blue Text', color: 'babyblue', align: 'right' }, undefined, folder.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Blue-Green Text', color: 'blue-green', align: 'left' }, undefined, folder.id)
    const { success } = await moveDataEntries([data2.id, data3.id])
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    expect(globaldata.map((d: any) => d.name)).to.include('azure-text')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folder.id])
    expect(String(remaining[1].dataId)).to.equal(data4.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move multiple site-level data entries within a site', async () => {
    const site = await createSite('datatestsite9')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Blush Text', color: 'blush', align: 'left' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Cerise', color: 'cerise', align: 'left' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Cerulean Text', color: 'cerulean', align: 'left' }, site.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Champagne Text', color: 'champagne', align: 'left' }, site.id)
    const { success } = await moveDataEntries([data1.id, data2.id], data4.id)
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {siteIds: [${site.id}]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id, data2.id, data4.id])
  })
  it('should move multiple site-level data entries to a folder', async () => {
    const site = await createSite('datatestsite10')
    const { dataFolder: folder } = await createDataFolder('datafolderT', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Khaki Text', color: 'khaki', align: 'right' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Ivory Text', color: 'ivory', align: 'left' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'GoldenRod Text', color: 'goldenrod', align: 'left' }, site.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Tan Text', color: 'tan', align: 'center' }, site.id)
    const { data: data5 } = await createDataEntry({ templateKey: 'keyd1', title: 'Salmon Text', color: 'salmon', align: 'center' }, site.id)
    const { success } = await moveDataEntries([data1.id, data2.id], undefined, folder.id)
    expect(success).to.be.true
    await moveDataEntries([data4.id, data5.id], data2.id)
    const { data } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = data.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data1.id, data4.id, data5.id, data2.id])
    const data3Order = await db.getval<number>('SELECT displayOrder FROM data WHERE dataId = ?', [data3.id])
    expect(data3Order).to.equal(1)
  })
  it('should move multiple site-level data entries to global data', async () => {
    const site = await createSite('datatestsite11')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Peach Text', color: 'peach', align: 'left' }, site.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Coral Text', color: 'coral', align: 'left' }, site.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Rosewood Text', color: 'rosewood', align: 'left' }, site.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Ruby Text', color: 'ruby', align: 'left' }, site.id)
    const { data: data5 } = await createDataEntry({ templateKey: 'keyd1', title: 'Crimson Text', color: 'crimson', align: 'center' }, site.id)
    const { success } = await moveDataEntries([data2.id, data3.id])
    expect(success).to.be.true
    await moveDataEntries([data1.id, data5.id], data3.id)
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    expect(globaldata.map((d: any) => d.name)).to.include.members(['peach-text', 'coral-text', 'rosewood-text'])
    const data4Order = await db.getval<number>('SELECT displayOrder FROM data WHERE dataId = ?', [data4.id])
    expect(data4Order).to.equal(1)
  })
  it('should update the display order of global data entries when multiple entries are moved', async () => {
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Plum Text', color: 'plum', align: 'left' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Eggplant Text', color: 'eggplant', align: 'left' })
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Blueviolet Text', color: 'blueviolet', align: 'left' })
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Steelblue Text', color: 'steelblue', align: 'left' })
    const { success } = await moveDataEntries([data2.id, data1.id], data4.id)
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    const globalcolornames = globaldata.map((d: any) => d.name)
    expect(globalcolornames.indexOf('blueviolet-text')).to.be.lessThan(globalcolornames.indexOf('eggplant-text'))
    expect(globalcolornames.indexOf('blueviolet-text')).to.be.lessThan(globalcolornames.indexOf('plum-text'))
  })
  it('should move multiple global data entries to a folder', async () => {
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Turquoise Text', color: 'turquoise', align: 'left' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Seagreen Text', color: 'coral', align: 'left' })
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Emerald Text', color: 'emerald', align: 'left' })
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Jade Text', color: 'jade', align: 'left' })
    const { data: data5 } = await createDataEntry({ templateKey: 'keyd1', title: 'Celadon Text', color: 'celadon', align: 'center' })
    const { dataFolder: folder } = await createDataFolder('datafolderU', 'keyd1', datatestsite1Id)
    const { success } = await moveDataEntries([data3.id, data4.id], undefined, folder.id)
    expect(success).to.be.true
    await moveDataEntries([data1.id, data5.id], data4.id)
    const { data } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = data.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id, data5.id, data4.id])
  })
  it('should move multiple global data entries to a site', async () => {
    const site = await createSite('datatestsite12')
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Sage Text', color: 'sage', align: 'left' })
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Taupe Text', color: 'taupe', align: 'left' })
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Slate Text', color: 'slate', align: 'left' })
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Eggshell Text', color: 'eggshell', align: 'left' })
    const { data: data5 } = await createDataEntry({ templateKey: 'keyd1', title: 'Applegreen Text', color: 'applegreen', align: 'center' })
    const { success } = await moveDataEntries([data3.id, data4.id], undefined, undefined, site.id)
    expect(success).to.be.true
    await moveDataEntries([data1.id, data5.id], data4.id)
    const { data: data6 } = await query(`{ data (filter: {siteIds: ["${site.id}"]}) { name } }`)
    expect(data6.map((d: any) => d.name)).to.include.ordered.members(['slate-text', 'sage-text', 'applegreen-text', 'eggshell-text'])
  })
  it('should move data entries from different locations', async () => {
    const { dataFolder: folderV } = await createDataFolder('datafolderV', 'keyd1', datatestsite1Id)
    const { dataFolder: folderW } = await createDataFolder('datafolderW', 'keyd1', datatestsite1Id)
    const { dataFolder: folderX } = await createDataFolder('datafolderX', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry({ templateKey: 'keyd1', title: 'Orchid Text', color: 'orchid', align: 'left' }, undefined, folderV.id)
    const { data: data2 } = await createDataEntry({ templateKey: 'keyd1', title: 'Royal Blue Text', color: 'royalblue', align: 'left' }, undefined, folderV.id)
    const { data: data3 } = await createDataEntry({ templateKey: 'keyd1', title: 'Merangue Text', color: 'merangue', align: 'left' }, undefined, folderV.id)
    const { data: data4 } = await createDataEntry({ templateKey: 'keyd1', title: 'Midnight Text', color: 'midnight', align: 'left' }, undefined, folderW.id)
    const { data: data5 } = await createDataEntry({ templateKey: 'keyd1', title: 'Linen Text', color: 'linen', align: 'center' }, undefined, folderW.id)
    const { data: data6 } = await createDataEntry({ templateKey: 'keyd1', title: 'Misty Rose Text', color: 'mistyrose', align: 'center' }, undefined, folderW.id)
    const { success } = await moveDataEntries([data2.id, data4.id], undefined, folderX.id)
    expect(success).to.be.true
    const { data: dataV } = await query(`{ data(filter: {folderIds: ["${folderV.id}"]}) { id } }`)
    let ids = dataV.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data1.id, data3.id])
    const { data: dataW } = await query(`{ data(filter: {folderIds: ["${folderW.id}"]}) { id } }`)
    ids = dataW.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data5.id, data6.id])
    const { data: dataX } = await query(`{ data(filter: {folderIds: ["${folderX.id}"]}) { id } }`)
    ids = dataX.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data4.id, data2.id])
  })
  it('should publish data on creation when the nopublish flag is set', async () => {
    const { success, data } = await createDataEntry({ templateKey: 'songdatakey', name: 'Amarillo By Morning', artist: 'George Strait', genre: 'country' })
    expect(success).to.be.true
    const { data: publishedData } = await query(`{ data(filter: {ids: ["${data.id}"] }) { published } }`)
    expect(publishedData[0].published).to.be.true
  })
  it('should republish data when a data entry with the nopublish flag set is deleted and then undeleted', async () => {
    const { data: dataEntry } = await createDataEntry({ templateKey: 'songdatakey', name: 'Friends in Low Places', artist: 'Garth Brooks', genre: 'country' })
    const id = dataEntry.id
    await query(`
      mutation DeleteDataEntries ($dataIds: [ID!]!) {
        deleteDataEntries (dataIds: $dataIds) {
          success
        }
      }
    `, { dataIds: [dataEntry.id] })
    const { data: deletedData } = await query(`{ data(filter: {ids: ["${id}"] }) { published } }`)
    expect(deletedData[0].published).to.be.false
    const { undeleteDataEntries: { success, data } } = await query(`
      mutation UndeleteDataEntries ($dataIds: [ID!]!) {
        undeleteDataEntries (dataIds: $dataIds) {
          success
          data { published }
        }
      }
    `, { dataIds: [id] })
    expect(data[0].published).to.be.true
  })
})
