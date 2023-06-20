/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'

chai.use(chaiAsPromised)

async function createSite (name: string, templateKey: string, username?: string) {
  const data = { savedAtVersion: '20220901120000', templateKey, title: 'Test Title' }
  const { createSite: { success, site, messages } } = await queryAs((username ?? 'su01'), 'mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success messages { message } site { id name } } }', { name, data })
  return { success, site, messages }
}

describe('sites mutations', () => {
  it('should create a site', async () => {
    const { success, site } = await createSite('newsitea', 'keyp1')
    expect(success).to.be.true
    expect(site.name).to.equal('newsitea')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site.id}] }) { id name } }`)
    expect(pages[0].name).to.equal('newsitea')
    const { sites } = await query('{ sites { name rootAssetFolder { name } } }')
    const newSite = sites.find((s: any) => s.name === 'newsitea')
    expect(newSite.rootAssetFolder.name).to.equal('newsitea')
  })
  it('should not allow a duplicate site name', async () => {
    const { success, messages } = await createSite('site1', 'keyp2')
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a site', async () => {
    await expect(createSite('newsiteB', 'ed07')).to.be.rejected
  })
  it('should update a site name', async () => {
    const { site: siteC } = await createSite('newsiteC', 'keyp1')
    const { renameSite: { success, site } } = await query('mutation RenameSite ($id: ID!, $name: UrlSafeString!, $validateOnly: Boolean ) { renameSite (siteId:$id, name: $name, validateOnly: $validateOnly) { success site { name } } }', { id: siteC.id, name: 'updatedSitec', validateOnly: false })
    expect(success).to.be.true
    expect(site.name).to.equal('updatedsitec')
  })
  it('should not allow an unauthorized user to update a site name', async () => {
    const { site: siteD } = await createSite('newsiteD', 'keyp1')
    await expect(queryAs('ed07', 'mutation RenameSite ($id: ID!, $name: UrlSafeString!, $validateOnly: Boolean) { renameSite (siteId:$id, name: $name, validateOnly: $validateOnly) { success site { name } } }', { id: siteD.id, name: 'updatedSiteD', validateOnly: false })).to.be.rejected
  })
  it('should add a site owner to a site', async () => {
    const { site: siteE } = await createSite('newsiteE', 'keyp1')
    const { updateSiteManagement: { success } } = await query('mutation UpdateSiteManagement ($id: ID!, $args: UpdateSiteManagementInput!, $validateOnly: Boolean) { updateSiteManagement (siteId:$id, args: $args, validateOnly: $validateOnly) { success site { name owner { id } } } }', { id: siteE.id, args: { ownerId: 'ed07' }, validateOnly: false })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteE.id}] }) { name owner { id } } }`)
    expect(sites[0].owner.id).to.equal('ed07')
  })
  it('should add an organization to a site', async () => {
    const { site: siteF } = await createSite('newsiteF', 'keyp1')
    const { organizations } = await query('{ organizations { id name } }')
    const { updateSiteManagement: { success } } = await query('mutation UpdateSiteManagement ($id: ID!, $args: UpdateSiteManagementInput!, $validateOnly: Boolean) { updateSiteManagement (siteId:$id, args: $args, validateOnly: $validateOnly) { success site { name organization { name } } } }', { id: siteF.id, args: { organizationId: organizations[0].id } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteF.id}] }) { name organization { name } } }`)
    expect(sites[0].organization.name).to.equal(organizations[0].name)
  })
  it('should add managers to a site', async () => {
    const { site: siteG } = await createSite('newsiteG', 'keyp1')
    const { updateSiteManagement: { success } } = await query('mutation UpdateSiteManagement ($id: ID!, $args: UpdateSiteManagementInput!, $validateOnly: Boolean) { updateSiteManagement (siteId:$id, args: $args, validateOnly: $validateOnly) { success } }', { id: siteG.id, args: { managerIds: ['ed01', 'ed02', 'ed03', 'ed04'] } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteG.id}] }) { name managers { id } } }`)
    expect(sites[0].managers.map((m: any) => m.id)).to.have.members(['ed01', 'ed02', 'ed03', 'ed04'])
  })
  it('should add a launch URL to a site', async () => {
    const { site: siteH } = await createSite('newsiteH', 'keyp1')
    const { setLaunchURL: { success } } = await query('mutation SetLaunchURL ($id: ID!, $host: String!, $path: String!, $enabled: Boolean!, $validateOnly: Boolean) { setLaunchURL (siteId:$id, host: $host, path: $path, enabled: $enabled, validateOnly: $validateOnly) { success } }', { id: siteH.id, host: 'www.example.com', path: '/departmentH/', enabled: true, validateOnly: false })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteH.id}] }) { launched url { host path prefix } } }`)
    expect(sites[0].launched).to.be.true
    expect(sites[0].url.host).to.equal('www.example.com')
    expect(sites[0].url.path).to.equal('/departmenth/')
    expect(sites[0].url.prefix).to.equal('https://www.example.com/departmenth/')
  })
  it('should delete a site', async () => {
    const { site: siteI } = await createSite('newsiteI', 'keyp1')
    const { deleteSite: { success } } = await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteI.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteI.id}], deleted: SHOW }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.not.be.null
  })
  it('should not allow an unauthorized user to delete a site', async () => {
    await expect(queryAs('ed07', 'mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
  it('should undelete a site', async () => {
    const { site: siteJ } = await createSite('newsiteJ', 'keyp1')
    await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteJ.id })
    const { undeleteSite: { success } } = await query('mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success  } }', { id: siteJ.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteJ.id}] }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete a site', async () => {
    await expect(queryAs('ed07', 'mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
})
