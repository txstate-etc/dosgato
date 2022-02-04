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
  it('should add approved templates to a site', async () => {
    const { createSite: { site: siteH } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteH', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success } }', { id: siteH.id, args: { siteTemplateKeys: ['keyp1', 'keyp2', 'keyp3'] } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteH.id}] }) { name templates { key } } }`)
    expect(sites[0].templates.map((t: any) => t.key)).to.have.members(['keyp1', 'keyp2', 'keyp3'])
  })
  it.skip('should add a launch URL to a site', async () => {})
  it('should delete a site', async () => {
    const { createSite: { site: siteI } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteI', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { deleteSite: { success, site } } = await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteI.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteI.id}] }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.not.be.null
  })
  it('should not allow an unauthorized user to delete a site', async () => {
    await expect(queryAs('ed07', 'mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
  it('should undelete a site', async () => {
    const { createSite: { site: siteJ } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'newsiteJ', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteJ.id })
    const { undeleteSite: { success, site } } = await query('mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success  } }', { id: siteJ.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteJ.id}] }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete a site', async () => {
    await expect(queryAs('ed07', 'mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
})
