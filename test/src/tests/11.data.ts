/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('datafolder', () => {
  let testSiteId: string
  before(async () => {
    const { sites } = await query('{ sites { id name } }')
    const site5 = sites.find((s: any) => s.name === 'site5')
    testSiteId = site5.id
  })
  it('should filter data folders by id', async () => {
    const { datafolders } = await query(`{ datafolders (filter: { siteIds: [${testSiteId}] }) { id name } }`)
    const ids = datafolders.map((f: any) => f.id)
    const { datafolders: datafolders2 } = await query(`
      {
        datafolders(filter: {ids: ["${ids[0]}", "${ids[1]}"] }){
          id
          name
        }
      }
    `)
    const folderIds = datafolders2.map((d: any) => d.id)
    expect(folderIds).to.have.members([ids[0], ids[1]])
  })
  it('should filter data folders by template key', async () => {
    const { datafolders } = await query(`
      {
        datafolders(filter: {siteIds: ["${testSiteId}"], templateKeys: ["keyd1"] }){
          name
          template {
            key
          }
          site {
            name
          }
        }
      }
    `)
    for (const folder of datafolders) {
      expect(folder.template.key).to.equal('keyd1')
      expect(folder.site.name).to.equal('site5')
    }
  })
  it('should return only deleted data folders', async () => {
    const { datafolders } = await query(`
      {
        datafolders(filter: {siteIds:["${testSiteId}"], deleted: ONLY }){
          name
          deleted
        }
      }
    `)
    for (const folder of datafolders) {
      expect(folder.deleted).to.be.true
    }
    const folderNames = datafolders.map((f: any) => f.name)
    expect(folderNames).to.include('site5datafolder3')
    expect(folderNames).to.not.include('site5datafolder1')
  })
  it('should return only undeleted data folders', async () => {
    const { datafolders } = await query(`
      {
        datafolders(filter: {siteIds:["${testSiteId}"], deleted: HIDE }){
          name
          deleted
        }
      }
    `)
    for (const folder of datafolders) {
      expect(folder.deleted).to.be.false
    }
    const folderNames = datafolders.map((f: any) => f.name)
    expect(folderNames).to.not.include('site5datafolder3')
    expect(folderNames).to.include('site5datafolder1')
  })
  it('should return the user who deleted a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: SHOW }) { id folder { name deletedBy { id } } } }')
    const entry = data.find((d: any) => d.folder?.name === 'deletedfolder')
    expect(entry.folder.deletedBy.id).to.equal('su03')
  })
  it('should return null for the user who deleted a datafolder if that datafolder is not deleted', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name deletedBy { id } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.deletedBy).to.be.null
    }
  })
  it('should return the template for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name template { name } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.template.name).to.equal('Colors')
    }
  })
  it('should return the site a datafolder belongs to', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name site { name } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.site.name).to.equal('site2')
    }
  })
  it('should return null for a datafolder\'s owning site if the datafolder is for global data', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name site { name } } } }')
    const globaldata = data.filter((d: any) => d.folder?.name === 'globaldatafolder')
    for (const dataEntry of globaldata) {
      expect(dataEntry.folder.site).to.be.null
    }
  })
  it('should return all data entries for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name data(filter: { deleted: SHOW }) { id data } } } }')
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    const dataEntries = site2data.folder.data
    const colors = dataEntries.map((e: any) => e.data.color)
    expect(colors).to.have.members(['red', 'blue', 'green', 'orange'])
  })
  it('should return filtered data entries for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id folder { name data(filter:{ deleted: HIDE }) { id data } } } }')
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    const dataEntries = site2data.folder.data
    const colors = dataEntries.map((e: any) => e.data.color)
    expect(colors).to.have.members(['red', 'blue', 'green'])
    expect(colors).to.not.have.members(['orange'])
  })
  it('should return roles that have any permissions on a datafolder', async () => {
    const { data } = await query(`
      {
        data(filter: { deleted: HIDE }) {
          id
          folder {
            name
            roles { id name }
          }
        }
      }`)
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    expect(site2data.folder.roles.map((r: any) => r.name)).to.include.members(['datarolestest1', 'datarolestest2'])
  })
  it('should return roles that have a specific permission on a datafolder', async () => {
    const { data } = await query(`
      {
        data(filter: { deleted: HIDE }) {
          id
          folder {
            name
            roles(withPermission: [DELETE]) { id name }
          }
        }
      }`)
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    const roleNames = site2data.folder.roles.map((r: any) => r.name)
    expect(roleNames).to.include.members(['datarolestest1'])
    expect(roleNames).to.not.have.members(['datarolestest2'])
  })
})

describe('data', () => {
  it('should filter data entries by ID (dataId)', async () => {
    const idResp = await query('{ data(filter: { deleted: HIDE }) { id } }')
    const ids = idResp.data.map((val: any) => val.id)
    const { data } = await query(`{ data(filter: { ids: ["${ids.slice(0, 3).join('","')}"]}) { id }}`)
    const returnIds = data.map((val: any) => val.id)
    expect(returnIds).to.have.members([...ids.slice(0, 3)])
  })
  it('should return only global data when the global=true filter is used', async () => {
    const { data } = await query('{ data(filter: { global: true }) { id site { name } } }')
    for (const entry of data) {
      expect(entry.site).to.be.null
    }
  })
  it('should only return data belonging to a site when the global=false filter is used', async () => {
    const { data } = await query('{ data(filter: { global: false }) { id site { name } } }')
    for (const entry of data) {
      expect(entry.site).to.not.be.null
    }
  })
  it('should filter data entries by folder ID', async () => {
    const entries = await query('{ data(filter: { deleted: SHOW }) {id folder { id name } } }')
    const site2data = entries.data.find((d: any) => d.folder?.name === 'site2datafolder')
    const folderId = site2data.folder.id
    const { data } = await query(`{ data(filter: { deleted: SHOW, folderIds: ["${folderId}"]}) { id } }`)
    expect(data).to.have.lengthOf(4)
  })
  it('should filter data entries by site ID', async () => {
    const siteResp = await query('{ sites { id name } }')
    const site2Id = siteResp.sites.find((s: any) => s.name === 'site2')
    const { data } = await query(`{ data(filter: { siteIds:["${site2Id}"] }) { id site { name } } }`)
    for (const entry of data) {
      expect(entry.site.name).to.equal('site2')
    }
  })
  it('should filter data entries by template key', async () => {
    const { data } = await query('{ data(filter: { templateKeys: ["keyd1"] }) { template { key name } data } }')
    for (const entry of data) {
      expect(entry.template.key).to.equal('keyd1')
      expect(entry.data).to.have.property('color')
    }
  })
  it('should return only deleted data entries when the deleted=ONLY filter is used', async () => {
    const { data } = await query('{ data(filter: { deleted: ONLY }) {id deleted } }')
    for (const entry of data) {
      expect(entry.deleted).to.be.true
    }
  })
  it('should return only undeleted data entries when the deleted=HIDE filter is used', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id deleted deleteState } }')
    for (const entry of data) {
      expect(entry.deleteState).to.not.equal(2)
    }
  })
  it('should return the user who deleted a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted: ONLY }) {id deletedBy { id } } }')
    for (const entry of data) {
      expect(entry.deletedBy).to.not.be.null
    }
  })
  it('should return null for the user who deleted a data entry if the data entry is not deleted', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id deleteState deletedBy { id } } }')
    for (const entry of data) {
      if (entry.deleteState === 0) expect(entry.deletedBy).to.be.null
    }
  })
  it('should return the JSON data for a data entry (no parameters)', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id data site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    expect(site2entries.map((e: any) => e.data.color)).to.include.members(['red', 'blue', 'green'])
  })
  it.skip('should return the JSON data for the published version of a data entry', async () => {

  })
  it.skip('should return the JSON data for a particular version of a data entry', async () => {

  })
  it('should return a data entry\'s template', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id data template { name } site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    for (const entry of site2entries) {
      expect(entry.template.name).to.equal('Colors')
    }
  })
  it('should return a data entry\'s parent folder', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id data folder { name } site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    for (const entry of site2entries) {
      if (entry.folder) expect(entry.folder.name).to.equal('site2datafolder')
    }
  })
  it('should return null for a data entry\'s parent folder if the data has no folder', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id data folder { name } site { name } } }')
    const filtered = data.filter((d: any) => typeof d.data.name !== 'undefined')
    for (const entry of filtered) {
      expect(entry.folder).to.be.null
    }
  })
  it('should return the site to which a data entry belongs', async () => {
    const { data } = await query('{ data(filter: { global:false }) {id  site { name } } }')
    for (const entry of data) {
      expect(entry.site).to.not.be.null
    }
  })
  it('should return null for site if a data entry is global and has no owning site', async () => {
    const { data } = await query('{ data(filter: { global:true }) {id  site { name } } }')
    for (const entry of data) {
      expect(entry.site).to.be.null
    }
  })
  it('should return whether a data entry is published', async () => {
    const { data } = await query('{ data(filter: { global:true }) { id data published template { name } } }')
    const articleData = data.filter((d: any) => d.template.name === 'articledata')
    for (const entry of articleData) {
      if (entry.data.title === '5 Steps to a Cleaner Car') {
        expect(entry.published).to.be.true
      } else if (entry.data.title === 'Trees of Central Texas') {
        expect(entry.published).to.be.false
      }
    }
  })
  it('should return when a data entry was created', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id createdAt } }')
    for (const entry of data) {
      expect(entry.createdAt).to.not.be.null
    }
  })
  it('should who created a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id data createdBy { id } } }')
    for (const entry of data) {
      expect(entry.createdBy).to.not.be.null
    }
    const sampleEntry = data.find((d: any) => d.data.color === 'blue')
    expect(sampleEntry.createdBy.id).to.equal('su01')
  })
  it('should return when a data entry was last modified', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id modifiedAt } }')
    for (const entry of data) {
      expect(entry.modifiedAt).to.not.be.null
    }
  })
  it('should return who last modified a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) {id data modifiedBy { id } } }')
    for (const entry of data) {
      expect(entry.modifiedBy).to.not.be.null
    }
    const sampleEntry = data.find((d: any) => d.data.color === 'blue')
    expect(sampleEntry.modifiedBy.id).to.equal('su01')
  })
  it('should return roles with any permissions on the data entry', async () => {
    const { data } = await query(`
      {
        data(filter: { deleted: HIDE }) {
          id
          name
          roles {
            id
            name
          }
        }
      }`)
    const blueItem = data.find((d: any) => d.name === 'Blue Content')
    expect(blueItem.roles.map((r: any) => r.name)).to.include.members(['datarolestest1', 'datarolestest2'])
  })
  it('should return rols with a specific permission on a data entry', async () => {
    const { data } = await query(`
      {
        data(filter: { deleted: HIDE }) {
          id
          name
          roles(withPermission: [DELETE]) {
            id
            name
          }
        }
      }`)
    const blueItem = data.find((d: any) => d.name === 'Blue Content')
    const roleNames = blueItem.roles.map((r: any) => r.name)
    expect(roleNames).to.include.members(['datarolestest1'])
    expect(roleNames).to.not.include.members(['datarolestest2'])
  })
  it('should return a list of all versions of a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted: HIDE }) { id data versions { user { id } version data } } }')
    const entryWithVersions = data.find((d: any) => d.data.color === 'red')
    expect(entryWithVersions.versions).to.have.lengthOf(2)
    for (const version of entryWithVersions.versions) {
      if (version.version === 1) {
        expect(version.user.id).to.equal('su01')
        expect(version.data.align).to.equal('center')
      } else {
        expect(version.user.id).to.equal('su03')
        expect(version.data.align).to.equal('left')
      }
    }
  })
})

describe('dataroot', () => {
  it('should retrieve the global dataroots', async () => {
    const { dataroots } = await query('{ dataroots(filter:{ global: true }) { site { id }, template { key } } }')
    expect(dataroots.length).to.be.greaterThan(0)
  })
  it('should retrieve all dataroots for a site', async () => {
    const { sites } = await query('{ sites (filter: { names: ["site2"] }) { dataroots { template { key } } } }')
    expect(sites[0].dataroots.length).to.be.greaterThan(0)
  })
  it('should filter dataroots by templateKey when used with a site', async () => {
    const { sites } = await query('{ sites (filter: { names: ["site2"] }) { dataroots (filter: { templateKeys: ["articledatakey"] }) { template { key } } } }')
    expect(sites[0].dataroots.length).to.equal(1)
    expect(sites[0].dataroots[0].template.key).to.equal('articledatakey')
  })
  it('should be able to fetch the dataroot for a folder', async () => {
    const { datafolders } = await query('{ datafolders (filter: { global: false }) { template { key } dataroot { template { key } } } }')
    for (const f of datafolders) expect(f.template.key).to.equal(f.dataroot.template.key)
  })
  it('should be able to fetch the dataroot for a global folder', async () => {
    const { datafolders } = await query('{ datafolders (filter: { global: true }) { template { key } dataroot { template { key } } } }')
    for (const f of datafolders) expect(f.template.key).to.equal(f.dataroot.template.key)
  })
})
