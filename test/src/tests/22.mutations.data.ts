/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'
import db from 'mysql2-async/db'
import { sleep } from 'txstate-utils'

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
  let datatestsite1Id: string
  let datatestsite2Id: string
  before(async () => {
    let resp = await query(`
      mutation CreateSite ($args: CreateSiteInput!) {
        createSite (args: $args) {
          success
          site { id name }
        }
      }`, { args: { name: 'datatestsite1', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    datatestsite1Id = resp.createSite.site.id
    resp = await query(`
      mutation CreateSite ($args: CreateSiteInput!) {
        createSite (args: $args) {
          success
          site { id name }
        }
      }`, { args: { name: 'datatestsite2', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    datatestsite2Id = resp.createSite.site.id
  })
  it('should create a data folder', async () => {
    const { success, dataFolder } = await createDataFolder('datafolderA', 'keyd1')
    expect(success).to.be.true
    expect(dataFolder.name).to.equal('datafolderA')
  })
  it('should not allow an unauthorized user to create a data folder', async () => {
    await expect(createDataFolder('test', 'keyd1', undefined, 'ed07')).to.be.rejected
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
    const { dataFolder: folder } = await createDataFolder('datafolderH', 'keyd2', datatestsite1Id)
    const { success, data } = await createDataEntry('FolderBuilding1', 'keyd2', { name: 'Green Hall', floors: 5 }, datatestsite1Id, folder.id)
    expect(success).to.be.true
    expect(data.name).to.equal('FolderBuilding1')
    const { sites } = await query(`{ sites(filter: { ids: [${datatestsite1Id}] }) { id name datafolders { data { name } } } }`)
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
  it('should move data within a data folder', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderJ', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry('Silver', 'keyd1', { title: 'Silver Text', color: 'silver', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry('Gold', 'keyd1', { title: 'Gold Text', color: 'gold', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry('Bronze', 'keyd1', { title: 'Bronze Text', color: 'bronze', align: 'center' }, datatestsite1Id, folder.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { aboveTarget: data1.id, siteId: datatestsite1Id } })
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data2.id, data1.id, data3.id])
  })
  it('should move data out of a folder to a site', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderK', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry('Blue', 'keyd1', { title: 'Blue Text', color: 'blue', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry('Green', 'keyd1', { title: 'Green Text', color: 'green', align: 'center' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry('Purple', 'keyd1', { title: 'Purple Text', color: 'purple', align: 'center' }, datatestsite1Id, folder.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { siteId: datatestsite2Id } })
    expect(data.folder).to.be.null
    expect(data.site.id).to.equal(datatestsite2Id)
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: {ids: [${datatestsite2Id}]}) { data { name }}}`)
    expect(sites[0].data.map((d: any) => d.name)).to.include('Green')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folder.id])
    expect(remaining[1].dataId).to.equal(data3.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move data out of a folder to global data', async () => {
    const { dataFolder: folder } = await createDataFolder('datafolderL', 'keyd1', datatestsite1Id)
    const { data: data1 } = await createDataEntry('Yellow', 'keyd1', { title: 'Yellow Text', color: 'yellow', align: 'left' }, datatestsite1Id, folder.id)
    const { data: data2 } = await createDataEntry('Orange', 'keyd1', { title: 'Orange Text', color: 'orange', align: 'left' }, datatestsite1Id, folder.id)
    const { data: data3 } = await createDataEntry('Red', 'keyd1', { title: 'Red Text', color: 'red', align: 'left' }, datatestsite1Id, folder.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data1.id, target: {} })
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    expect(globaldata.map((d: any) => d.name)).to.include('Yellow')
    const remaining = await db.getall(`
      SELECT dataId, displayOrder FROM data
      INNER JOIN datafolders ON data.folderId = datafolders.id
      WHERE datafolders.guid = ?`, [folder.id])
    expect(remaining[0].dataId).to.equal(data2.id)
    expect(remaining[0].displayOrder).to.equal(1)
  })
  it('should move site-level data within a site', async () => {
    const { createSite: { site } } = await query(`
    mutation CreateSite ($args: CreateSiteInput!) {
      createSite (args: $args) {
        success
        site { id name }
      }
    }`, { args: { name: 'datatestsite3', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { data: data1 } = await createDataEntry('Medium Gray', 'keyd1', { title: 'Medium Gray Text', color: 'mdgray', align: 'left' }, site.id)
    const { data: data2 } = await createDataEntry('Dark Gray', 'keyd1', { title: 'Dark Gray Text', color: 'dkgray', align: 'left' }, site.id)
    const { data: data3 } = await createDataEntry('Light Gray', 'keyd1', { title: 'Light Gray Text', color: 'ltgray', align: 'left' }, site.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data3.id, target: { aboveTarget: data1.id } })
    expect(success).to.be.true
    const { data: sortedData } = await query(`{ data(filter: {siteIds: [${site.id}]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id, data2.id])
  })
  it('should move site-level data to a folder', async () => {
    const { createSite: { site } } = await query(`
    mutation CreateSite ($args: CreateSiteInput!) {
      createSite (args: $args) {
        success
        site { id name }
      }
    }`, { args: { name: 'datatestsite4', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { dataFolder: folder } = await createDataFolder('datafolderM', 'keyd1', site.id)
    const { data: data1 } = await createDataEntry('Pink', 'keyd1', { title: 'Pink Text', color: 'pink', align: 'right' }, site.id)
    const { data: data2 } = await createDataEntry('Lavender', 'keyd1', { title: 'Lavender Text', color: 'lavender', align: 'right' }, site.id)
    const { data: data3 } = await createDataEntry('Cream', 'keyd1', { title: 'Cream Text', color: 'cream', align: 'right' }, site.id)
    const { data: data4 } = await createDataEntry('Mint', 'keyd1', { title: 'Mint Text', color: 'mint', align: 'right' }, site.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { folderId: folder.id } })
    expect(success).to.be.true
    await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data4.id, target: { aboveTarget: data2.id } })
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data4.id, data2.id])
    const remaining = await db.getall('SELECT dataId, displayOrder FROM data WHERE folderId IS NULL and siteId = ?', [site.id])
    expect(remaining[1].dataId).to.equal(data3.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should move site-level data to global data', async () => {
    const { createSite: { site } } = await query(`
    mutation CreateSite ($args: CreateSiteInput!) {
      createSite (args: $args) {
        site { id name }
      }
    }`, { args: { name: 'datatestsite5', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { data: data1 } = await createDataEntry('Black', 'keyd1', { title: 'Black Text', color: 'black', align: 'center' }, site.id)
    const { data: data2 } = await createDataEntry('Brown', 'keyd1', { title: 'Brown Text', color: 'brown', align: 'right' }, site.id)
    const { data: data3 } = await createDataEntry('Lime', 'keyd1', { title: 'Lime Text', color: 'lime', align: 'left' }, site.id)
    const { data: data4 } = await createDataEntry('Cyan', 'keyd1', { title: 'Cyan Text', color: 'cyan', align: 'right' }, site.id)
    const { moveDataEntry: { success, data } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data3.id, target: {} })
    expect(success).to.be.true
    await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data1.id, target: { aboveTarget: data3.id } })
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    const globaldatanames = globaldata.map((d: any) => d.name)
    expect(globaldatanames).to.include('Lime')
    const position: number = globaldatanames.indexOf('Lime')
    expect(globaldatanames.indexOf('Black')).to.be.lessThan(position)
    const remaining = await db.getall('SELECT dataId, displayOrder FROM data WHERE folderId IS NULL AND siteId = ?', [site.id])
    expect(remaining[1].dataId).to.equal(data4.id)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should update the display order of global data', async () => {
    const { data: data1 } = await createDataEntry('Maroon', 'keyd1', { title: 'Maroon Text', color: 'maroon', align: 'center' })
    const { data: data2 } = await createDataEntry('Magenta', 'keyd1', { title: 'Magenta Text', color: 'magenta', align: 'right' })
    const { moveDataEntry: { success } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { aboveTarget: data1.id } })
    expect(success).to.be.true
    const { data: globaldata } = await query('{ data(filter: {global: true }) { name } }')
    const globaldatanames = globaldata.map((d: any) => d.name)
    expect(globaldatanames).to.include('Lime')
    expect(globaldatanames.indexOf('Magenta')).to.be.lessThan(globaldatanames.indexOf('Maroon'))
  })
  it('should move global data to a folder', async () => {
    const { data: data1 } = await createDataEntry('Raspberry', 'keyd1', { title: 'Raspberry Text', color: 'raspberry', align: 'center' })
    const { data: data2 } = await createDataEntry('Cherry', 'keyd1', { title: 'Cherry Text', color: 'cherry', align: 'right' })
    const { data: data3 } = await createDataEntry('Mauve', 'keyd1', { title: 'Mauve Text', color: 'mauve', align: 'right' })
    const { data: data4 } = await createDataEntry('Sky Blue', 'keyd1', { title: 'Sky Blue Text', color: 'skyblue', align: 'right' })
    const { dataFolder: folder } = await createDataFolder('datafolderN', 'keyd1', datatestsite2Id)
    const { moveDataEntry: { success } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data1.id, target: { folderId: folder.id } })
    expect(success).to.be.true
    await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data3.id, target: { aboveTarget: data1.id } })
    const { data: sortedData } = await query(`{ data(filter: {folderIds: ["${folder.id}"]}) { id } }`)
    const ids = sortedData.map((d: any) => d.id)
    expect(ids).to.have.ordered.members([data3.id, data1.id])
  })
  it('should move data from global data to a site', async () => {
    const { data: data1 } = await createDataEntry('Teal', 'keyd1', { title: 'Teal Text', color: 'teal', align: 'center' })
    const { data: data2 } = await createDataEntry('Tangerine', 'keyd1', { title: 'Tangerine Text', color: 'tangerine', align: 'right' })
    const { data: data3 } = await createDataEntry('Navy', 'keyd1', { title: 'Navy Text', color: 'navy', align: 'left' })
    const { createSite: { site } } = await query(`
    mutation CreateSite ($args: CreateSiteInput!) {
      createSite (args: $args) {
        site { id name }
      }
    }`, { args: { name: 'datatestsite6', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { moveDataEntry: { success } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data1.id, target: { siteId: site.id } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: {ids: [${site.id}]}) { data { name }}}`)
    expect(sites[0].data.map((d: any) => d.name)).to.include('Teal')
  })
  it('should move data from one folder to another', async () => {
    const { dataFolder: folderO } = await createDataFolder('datafolderO', 'keyd1', datatestsite2Id)
    const { dataFolder: folderP } = await createDataFolder('datafolderP', 'keyd1', datatestsite2Id)
    const { data: data1 } = await createDataEntry('Evergreen', 'keyd1', { title: 'Evergreen Text', color: 'evergreen', align: 'center' }, undefined, folderO.id)
    const { data: data2 } = await createDataEntry('Lemon', 'keyd1', { title: 'Lemon Text', color: 'lemon', align: 'right' }, undefined, folderO.id)
    const { data: data3 } = await createDataEntry('Olive', 'keyd1', { title: 'Olive Text', color: 'olive', align: 'right' }, undefined, folderO.id)
    const { data: data4 } = await createDataEntry('Indigo', 'keyd1', { title: 'Indigo Text', color: 'indigo', align: 'left' }, undefined, folderP.id)
    const { moveDataEntry: { success } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { folderId: folderP.id } })
    expect(success).to.be.true
    const { data: sortedDataO } = await query(`{ data(filter: {folderIds: ["${folderO.id}"]}) { id } }`)
    expect(sortedDataO.map((d: any) => d.id)).to.have.ordered.members([data1.id, data3.id])
    const { data: sortedDataP } = await query(`{ data(filter: {folderIds: ["${folderP.id}"]}) { id } }`)
    expect(sortedDataP.map((d: any) => d.id)).to.have.ordered.members([data4.id, data2.id])
  })
  it('should move data from one site to another', async () => {
    const { createSite: { site: site7 } } = await query(`
      mutation CreateSite ($args: CreateSiteInput!) {
        createSite (args: $args) {
          site { id name }
        }
      }`, { args: { name: 'datatestsite7', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { createSite: { site: site8 } } = await query(`
      mutation CreateSite ($args: CreateSiteInput!) {
        createSite (args: $args) {
          site { id name }
        }
      }`, { args: { name: 'datatestsite8', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { data: data1 } = await createDataEntry('Hot Pink', 'keyd1', { title: 'Hot Pink Text', color: 'hotpink', align: 'center' }, site7.id)
    const { data: data2 } = await createDataEntry('Rose', 'keyd1', { title: 'Rose Text', color: 'rose', align: 'right' }, site7.id)
    const { data: data3 } = await createDataEntry('Tomato', 'keyd1', { title: 'Tomato Text', color: 'tomato', align: 'right' }, site7.id)
    const { data: data4 } = await createDataEntry('Brick', 'keyd1', { title: 'Brick Text', color: 'brick', align: 'left' }, site8.id)
    const { moveDataEntry: { success } } = await query(`
      mutation MoveDataEntry ($dataId: ID!, $target: MoveDataTarget!) {
        moveDataEntry (dataId: $dataId, target: $target) {
          success
          data {
            id
            name
            site { id name }
            folder { id name }
          }
        }
      }`, { dataId: data2.id, target: { siteId: site8.id } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: {ids: [${site7.id}, ${site8.id}]}) { id data { name }}}`)
    for (const site of sites) {
      if (site.id === site7.id) {
        expect(site.data.map((d: any) => d.name)).to.include.members(['Hot Pink', 'Tomato'])
      } else {
        expect(site.data.map((d: any) => d.name)).to.include.members(['Rose', 'Brick'])
      }
    }
  })
})
