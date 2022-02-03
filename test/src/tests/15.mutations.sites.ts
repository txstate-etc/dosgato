/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

describe('sites mutations', () => {
  it('should create a site', async () => {
    const { createSite: { success, site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteA', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    expect(success).to.be.true
    expect(site.name).to.equal('newsiteA')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site.id}] }) { id name } }`)
    expect(pages[0].name).to.equal('newsiteA')
    const { sites } = await query('{ sites { name assetroot { name } } }')
    const newSite = sites.find((s: any) => s.name === 'newsiteA')
    expect(newSite.assetroot.name).to.equal('newsiteA')
  })
  it('should not allow a duplicate site name', async () => {
    const { createSite: { success, messages } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success messages } }', { args: { name: 'site1', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a site', async () => {
    await expect(queryAs('ed07', 'mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteB', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })).to.be.rejected
  })
  it('should update a site name', async () => {
    const { createSite: { site: siteC } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteC', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name } } }', { id: siteC.id, args: { name: 'updatedSiteC' } })
    expect(success).to.be.true
    expect(site.name).to.equal('updatedSiteC')
  })
  it('should not allow an unauthorized user to update a site name', async () => {
    const { createSite: { site: siteD } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteD', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    await expect(queryAs('ed07', 'mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name } } }', { id: siteD.id, args: { name: 'updatedSiteD' } })).to.be.rejected
  })
  it('should add a site owner to a site', async () => {
    const { createSite: { site: siteE } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteE', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name owner { id } } } }', { id: siteE.id, args: { ownerId: 'ed07' } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteE.id}] }) { name owner { id } } }`)
    expect(sites[0].owner.id).to.equal('ed07')
  })
  it('should add an organization to a site', async () => {
    const { createSite: { site: siteF } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteF', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { organizations } = await query('{ organizations { id name } }')
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name organization { name } } } }', { id: siteF.id, args: { organizationId: organizations[0].id } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteF.id}] }) { name organization { name } } }`)
    expect(sites[0].organization.name).to.equal(organizations[0].name)
  })
  it('should add managers to a site', async () => {
    const { createSite: { site: siteG } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteG', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success } }', { id: siteG.id, args: { managerIds: ['ed01', 'ed02', 'ed03', 'ed04'] } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteG.id}] }) { name managers { id } } }`)
    expect(sites[0].managers.map((m: any) => m.id)).to.have.members(['ed01', 'ed02', 'ed03', 'ed04'])
  })
  it.skip('should add approved templates to a site', async () => {})
  it.skip('should add a launch URL to a site', async () => {})
  it.skip('should delete a site', async () => {})
  it.skip('should not allow an unauthorized user to delete a site', async () => {})
  it.skip('should undelete a site', async () => {})
  it.skip('should not allow an unauthorized user to undelete a site', async () => {})
})
