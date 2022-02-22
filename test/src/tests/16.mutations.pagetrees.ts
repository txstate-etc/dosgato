/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

describe('pagetree mutations', () => {
  let testSiteId: string
  before(async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'pagetreetestsite', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    testSiteId = site.id
  })
  it('should create a pagetree', async () => {
    const { createPagetree: { success, pagetree } } = await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name type } } }', { args: { siteId: testSiteId, name: 'sandboxA', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    expect(success).to.be.true
    expect(pagetree.name).to.equal('sandboxA')
    expect(pagetree.type).to.equal('SANDBOX')
    const { pages } = await query(`{ pages(filter: { pagetreeIds: [${pagetree.id}] }) { id name } }`)
    expect(pages[0].name).to.equal('pagetreetestsite')
  })
  it('should not allow a duplicate pagetree name', async () => {
    await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name type } } }', { args: { siteId: testSiteId, name: 'sandboxB', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { createPagetree: { success, pagetree, messages } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success messages { message } pagetree { id name type } } }', { args: { siteId: testSiteId, name: 'sandboxB', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a pagetree', async () => {
    await expect(queryAs('ed07', 'mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name } } }', { args: { siteId: testSiteId, name: 'sandboxC', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })).to.be.rejected
  })
  it('should update a pagetree name', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name type } } }', { args: { siteId: testSiteId, name: 'sandboxD', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { updatePagetree: { success, pagetree } } = await query('mutation UpdatePagetree ($pagetreeId: ID!, $name: String!) { updatePagetree (pagetreeId: $pagetreeId, name: $name) { success pagetree { id name } } }', { pagetreeId: newPagetree.id, name: 'sandboxD_renamed' })
    expect(success).to.be.true
    expect(pagetree.name).to.equal('sandboxD_renamed')
  })
  it('should not allow an unauthorized user to update a pagetree name', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name type } } }', { args: { siteId: testSiteId, name: 'sandboxE', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    await expect(queryAs('ed07', 'mutation UpdatePagetree ($pagetreeId: ID!, $name: String!) { updatePagetree (pagetreeId: $pagetreeId, name: $name) { success pagetree { id name } } }', { pagetreeId: newPagetree.id, name: 'sandboxE_renamed' })).to.be.rejected
  })
  it('should soft-delete a pagetree', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxF', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    expect(newPagetree.deleted).to.be.false
    const { deletePagetree: { success, pagetree } } = await query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: newPagetree.id })
    expect(success).to.be.true
    expect(pagetree.deleted).to.be.true
  })
  it('should not allow the primary page tree to be deleted', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { name pagetrees { id type } } }`)
    const primaryPagetree = sites[0].pagetrees.find((p: any) => p.type === 'PRIMARY')
    await expect(query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success messages { message } } }', { id: primaryPagetree.id })).to.be.rejected
  })
  it('should not allow an unauthorized user to delete a pagetree', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxG', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    await expect(queryAs('ed07', 'mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name } } }', { id: newPagetree.id })).to.be.rejected
  })
  it('should undelete a pagetree', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxH', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { deletePagetree: { pagetree: pagetreeDeleted } } = await query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: newPagetree.id })
    const { undeletePagetree: { success, pagetree } } = await query('mutation UndeletePagetree ($id: ID!) { undeletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: pagetreeDeleted.id })
    expect(success).to.be.true
    expect(pagetree.deleted).to.be.false
  })
  it('should not allow an unauthorized user to undelete a pagetree', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxI', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { deletePagetree: { pagetree: pagetreeDeleted } } = await query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: newPagetree.id })
    await expect(queryAs('ed07', 'mutation UndeletePagetree ($id: ID!) { undeletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: pagetreeDeleted.id })).to.be.rejected
  })
  it('should promote a pagetree from sandbox to primary', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { name pagetrees { id type } } }`)
    const initialPagetree = sites[0].pagetrees.find((p: any) => p.type === 'PRIMARY')
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxJ', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    const { promotePagetree: { pagetree, success } } = await query('mutation PromotePagetree ($id: String!) { promotePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })
    expect(success).to.be.true
    expect(pagetree.type).to.equal('PRIMARY')
    const { sites: updatedSites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { name pagetrees(filter: { ids: [${initialPagetree.id}] }) { id type } } }`)
    expect(updatedSites[0].pagetrees[0].type).to.equal('ARCHIVE')
  })
  it('should not allow an unauthorized user to promote a pagetree', async () => {
    const { createPagetree: { pagetree: newPagetree } } =
      await query('mutation CreatePagetree ($args: CreatePagetreeInput!) { createPagetree (args: $args) { success pagetree { id name deleted } } }', { args: { siteId: testSiteId, name: 'sandboxK', rootPageTemplateKey: 'keyp1', schemaVersion: Date.now() } })
    await expect(queryAs('ed07', 'mutation PromotePagetree ($id: String!) { promotePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })).to.be.rejected
  })
})
