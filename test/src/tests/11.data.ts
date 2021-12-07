/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('datafolder', () => {
  it('should return the user who deleted a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: true }) { id folder { name deletedBy { id } } } }')
    const entry = data.find((d: any) => d.folder?.name === 'deletedfolder')
    expect(entry.folder.deletedBy.id).to.equal('su03')
  })
  it('should return null for the user who deleted a datafolder if that datafolder is not deleted', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name deletedBy { id } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.deletedBy).to.be.null
    }
  })
  it('should return the template for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name template { name } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.template.name).to.equal('datatemplate1')
    }
  })
  it('should return the site a datafolder belongs to', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name site { name } } } }')
    const site2data = data.filter((d: any) => d.folder?.name === 'site2datafolder')
    for (const dataEntry of site2data) {
      expect(dataEntry.folder.site.name).to.equal('site2')
    }
  })
  it('should return null for a datafolder\'s owning site if the datafolder is for global data', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name site { name } } } }')
    const globaldata = data.filter((d: any) => d.folder?.name === 'globaldatafolder')
    for (const dataEntry of globaldata) {
      expect(dataEntry.folder.site).to.be.null
    }
  })
  it('should return all data entries for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name data { id data } } } }')
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    const dataEntries = site2data.folder.data
    const colors = dataEntries.map((e: any) => e.data.color)
    expect(colors).to.have.members(['red', 'blue', 'green', 'orange'])
  })
  it('should return filtered data entries for a datafolder', async () => {
    const { data } = await query('{ data(filter: { deleted: false }) { id folder { name data(filter:{ deleted:false }) { id data } } } }')
    const site2data = data.find((d: any) => d.folder?.name === 'site2datafolder')
    const dataEntries = site2data.folder.data
    const colors = dataEntries.map((e: any) => e.data.color)
    expect(colors).to.have.members(['red', 'blue', 'green'])
    expect(colors).to.not.have.members(['orange'])
  })
})

describe('data', () => {
  it('should filter data entries by ID (dataId)', async () => {
    const idResp = await query('{ data(filter: { deleted: false }) { id } }')
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
    const nondeleted = await query('{ data(filter: { deleted:false }) {id folder { id name } } }')
    const site2data = nondeleted.data.find((d: any) => d.folder?.name === 'site2datafolder')
    const folderId = site2data.folder.id
    const { data } = await query(`{ data(filter: { folderIds: ["${folderId}"]}) { id } }`)
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
  it('should return only deleted data entries when the deleted=true filter is used', async () => {
    const { data } = await query('{ data(filter: { deleted:true }) {id deleted } }')
    for (const entry of data) {
      expect(entry.deleted).to.be.true
    }
  })
  it('should return only undeleted data entries when the deleted=false filter is used', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id deleted } }')
    for (const entry of data) {
      expect(entry.deleted).to.be.false
    }
  })
  it('should return the user who deleted a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted:true }) {id deletedBy { id } } }')
    for (const entry of data) {
      expect(entry.deletedBy).to.not.be.null
    }
  })
  it('should return null for the user who deleted a data entry if the data entry is not deleted', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id deletedBy { id } } }')
    for (const entry of data) {
      expect(entry.deletedBy).to.be.null
    }
  })
  it('should return the JSON data for a data entry (no parameters)', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) { id data site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    expect(site2entries.map((e: any) => e.data.color)).to.have.members(['red', 'blue', 'green'])
  })
  it.skip('should return the JSON data for the published version of a data entry', async () => {

  })
  it.skip('should return the JSON data for a particular version of a data entry', async () => {

  })
  it('should return a data entry\'s template', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id data template { name } site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    for (const entry of site2entries) {
      expect(entry.template.name).to.equal('datatemplate1')
    }
  })
  it('should return a data entry\'s parent folder', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id data folder { name } site { name } } }')
    const site2entries = data.filter((d: any) => d.site?.name === 'site2')
    for (const entry of site2entries) {
      expect(entry.folder.name).to.equal('site2datafolder')
    }
  })
  it('should return null for a data entry\'s parent folder if the data has no folder', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id data folder { name } site { name } } }')
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
    const { data } = await query('{ data(filter: { deleted:false }) {id createdAt } }')
    for (const entry of data) {
      expect(entry.createdAt).to.not.be.null
    }
  })
  it('should who created a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id data createdBy { id } } }')
    for (const entry of data) {
      expect(entry.createdBy).to.not.be.null
    }
    const sampleEntry = data.find((d: any) => d.data.color === 'blue')
    expect(sampleEntry.createdBy.id).to.equal('su01')
  })
  it('should return when a data entry was last modified', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id modifiedAt } }')
    for (const entry of data) {
      expect(entry.modifiedAt).to.not.be.null
    }
  })
  it('should return who last modified a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) {id data modifiedBy { id } } }')
    for (const entry of data) {
      expect(entry.modifiedBy).to.not.be.null
    }
    const sampleEntry = data.find((d: any) => d.data.color === 'blue')
    expect(sampleEntry.modifiedBy.id).to.equal('su01')
  })
  it('should return a list of all versions of a data entry', async () => {
    const { data } = await query('{ data(filter: { deleted:false }) { id data versions { user { id } version data } } }')
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
