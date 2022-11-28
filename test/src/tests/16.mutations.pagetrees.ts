/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createPagetree (siteId: string, templateKey: string, username?: string, validateOnly?: boolean) {
  const data = { savedAtVersion: '20220801120000', templateKey, title: 'Test Title' }
  const { createPagetree: { success, messages, pagetree } } = await queryAs((username ?? 'su01'), `
    mutation CreatePagetree ($siteId: ID!, $data: JsonData!, $validateOnly: Boolean) {
      createPagetree (siteId: $siteId, data: $data, validateOnly: $validateOnly) {
        success
        messages { message }
        pagetree { id name type deleted }
      }
    }`, { siteId, data, validateOnly })
  return { success, messages, pagetree }
}

describe('pagetree mutations', () => {
  let testSiteId: string
  before(async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name } } }', { name: 'pagetreetestsite', data: { savedAtVersion: '20220901120000', templateKey: 'keyp1', title: 'Test Title' } })
    testSiteId = site.id
  })
  it('should create a pagetree', async () => {
    const { success, pagetree } = await createPagetree(testSiteId, 'keyp1')
    expect(success).to.be.true
    expect(pagetree.name).to.equal('pagetreetestsite-sandbox')
    expect(pagetree.type).to.equal('SANDBOX')
    const { pages } = await query(`{ pages(filter: { pagetreeIds: [${pagetree.id}] }) { id name } }`)
    expect(pages[0].name).to.equal('pagetreetestsite')
  })
  it('should not allow an unauthorized user to create a pagetree', async () => {
    await expect(createPagetree(testSiteId, 'ed07')).to.be.rejected
  })
  it('should soft-delete a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp3')
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
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp2')
    await expect(queryAs('ed07', 'mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name } } }', { id: newPagetree.id })).to.be.rejected
  })
  it('should undelete a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp3')
    const { deletePagetree: { pagetree: pagetreeDeleted } } = await query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: newPagetree.id })
    const { undeletePagetree: { success, pagetree } } = await query('mutation UndeletePagetree ($id: ID!) { undeletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: pagetreeDeleted.id })
    expect(success).to.be.true
    expect(pagetree.deleted).to.be.false
  })
  it('should not allow an unauthorized user to undelete a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp1')
    const { deletePagetree: { pagetree: pagetreeDeleted } } = await query('mutation DeletePagetree ($id: ID!) { deletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: newPagetree.id })
    await expect(queryAs('ed07', 'mutation UndeletePagetree ($id: ID!) { undeletePagetree (pagetreeId: $id) { success pagetree { id name deleted } } }', { id: pagetreeDeleted.id })).to.be.rejected
  })
  it('should promote a pagetree from sandbox to primary', async () => {
    const { sites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { name pagetrees { id type } } }`)
    const initialPagetree = sites[0].pagetrees.find((p: any) => p.type === 'PRIMARY')
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp2')
    const { promotePagetree: { pagetree, success } } = await query('mutation PromotePagetree ($id: ID!) { promotePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })
    expect(success).to.be.true
    expect(pagetree.type).to.equal('PRIMARY')
    const { sites: updatedSites } = await query(`{ sites(filter: { ids: [${testSiteId}] }) { name pagetrees(filter: { ids: [${initialPagetree.id}] }) { id type } } }`)
    expect(updatedSites[0].pagetrees[0].type).to.equal('ARCHIVE')
  })
  it('should not allow an unauthorized user to promote a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp1')
    await expect(queryAs('ed07', 'mutation PromotePagetree ($id: ID!) { promotePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })).to.be.rejected
  })
  it('should archive a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp1')
    const { archivePagetree: { pagetree, success } } = await query('mutation ArchivePagetree ($id: ID!) { archivePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })
    expect(success).to.be.true
    expect(pagetree.type).to.equal('ARCHIVE')
  })
  it('should not allow the primary pagetree to be archived', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp1')
    await query('mutation PromotePagetree ($id: ID!) { promotePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })
    await expect(query('mutation ArchivePagetree ($id: ID!) { archivePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })).to.be.rejected
  })
  it('should not allow an unauthorized user to archive a pagetree', async () => {
    const { pagetree: newPagetree } = await createPagetree(testSiteId, 'keyp1')
    await expect(queryAs('ed07', 'mutation ArchivePagetree ($id: ID!) { archivePagetree (pagetreeId: $id) { success pagetree { id name type } } }', { id: newPagetree.id })).to.be.rejected
  })
})
