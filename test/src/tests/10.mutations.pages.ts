/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createPage (name: string, parentId: string, templateKey: string, username?: string) {
  const { createPage: { success, page, messages } } = await queryAs((username ?? 'su01'), 'mutation CreatePage ($args: CreatePageInput!) { createPage (args: $args) { success messages { message } page { id name } } }', { args: { name, targetId: parentId, templateKey, schemaVersion: DateTime.utc() } })
  return { success, page, messages }
}

describe('pages mutations', () => {
  let testSite6Id: string
  let testSite6PageRootId: string
  before(async () => {
    const { sites } = await query('{ sites { id name pageroot { id } } }')
    const site6 = sites.find((s: any) => s.name === 'site6')
    testSite6Id = site6.id
    testSite6PageRootId = site6.pageroot.id
  })
  it('should be able to move a page', async () => {
    const { pages } = await query(`
      query getPagesToMove ($page: String!, $parent: String!) {
        pages (filter: { paths: [$page, $parent], pagetreeTypes: [PRIMARY] }) {
          id
          name
        }
      }
    `, { page: '/site1/about/location', parent: '/site1' })
    const toMove = pages.find((p: any) => p.name === 'location')
    const intoPage = pages.find((p: any) => p.name === 'site1')
    const { movePage: { page } } = await query('mutation movePage ($pageId: ID!, $parentId: ID!) { movePage (pageId: $pageId, targetId: $parentId) { page { name, parent { name } } } }', { pageId: toMove.id, parentId: intoPage.id })
    expect(page.parent.name).to.equal('site1')
  })
  it('should not allow an unauthorized user to move a page', async () => {
    const { page: movingPage } = await createPage('testpage11', testSite6PageRootId, 'keyp3')
    const { page: targetPage } = await createPage('testpage12', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation movePage ($pageId: ID!, $parentId: ID!) { movePage (pageId: $pageId, targetId: $parentId) { page { name, parent { name } } } }', { pageId: movingPage.id, parentId: targetPage.id })).to.be.rejected
  })
  it('should create a page', async () => {
    const { success, page } = await createPage('testpage1', testSite6PageRootId, 'keyp3')
    expect(success).to.be.true
    expect(page.name).to.equal('testpage1')
  })
  it('should not allow an unauthorized user to create a page', async () => {
    await expect(createPage('testpage2', testSite6PageRootId, 'keyp3', 'ed07')).to.be.rejected
  })
  it('should rename a page', async () => {
    const { page: testpage } = await createPage('testpage3', testSite6PageRootId, 'keyp3')
    const { renamePage: { success, page } } = await query('mutation UpdatePage ($name: String!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamedtestpage3', pageId: testpage.id })
    expect(success).to.be.true
    expect(page.name).to.equal('renamedtestpage3')
  })
  it('should not allow the root page to be renamed', async () => {
    await expect(query('mutation UpdatePage ($name: String!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamingrootpage', pageId: testSite6PageRootId })).to.be.rejected
  })
  it('should not allow an unauthorized user to rename a page', async () => {
    const { page: testpage } = await createPage('testpage4', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation UpdatePage ($name: String!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamingrootpage', pageId: testpage.id })).to.be.rejected
  })
  it('should delete a page', async () => {
    const { page: testpage } = await createPage('testpage5', testSite6PageRootId, 'keyp3')
    const { deletePage: { success, page } } = await query('mutation DeletePage ($pageId: ID!) {deletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })
    expect(success).to.be.true
    expect(page.deleted).to.be.true
    expect(page.deletedAt).to.not.be.null
    expect(page.deletedBy.id).to.equal('su01')
  })
  it('should not allow an unauthorized user to delete a page', async () => {
    const { page: testpage } = await createPage('testpage6', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation DeletePage ($pageId: ID!) {deletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })).to.be.rejected
  })
  it('should undelete a page', async () => {
    const { page: testpage } = await createPage('testpage7', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePage ($pageId: ID!) {deletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })
    const { undeletePage: { success, page } } = await query('mutation UndeletePage ($pageId: ID!) {undeletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })
    expect(success).to.be.true
    expect(page.deleted).to.be.false
    expect(page.deletedAt).to.be.null
    expect(page.deletedBy).to.be.null
  })
  it('should not allow an unauthorized user to undelete a page', async () => {
    const { page: testpage } = await createPage('testpage8', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePage ($pageId: ID!) {deletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })
    await expect(queryAs('ed07', 'mutation UndeletePage ($pageId: ID!) {undeletePage (pageId: $pageId) { success page { id name deleted deletedAt deletedBy { id name } } } }', { pageId: testpage.id })).to.be.rejected
  })
  it('should publish a page', async () => {
    const { page: testpage } = await createPage('testpage9', testSite6PageRootId, 'keyp3')
    const { publishPage: { success } } = await query('mutation PublishPage ($pageId: ID!) {publishPage (pageId: $pageId) { success } }', { pageId: testpage.id })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.true
  })
  it('should not allow an unauthorized user to publish a page', async () => {
    const { page: testpage } = await createPage('testpage10', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation PublishPage ($pageId: ID!) {publishPage (pageId: $pageId) { success } }', { pageId: testpage.id })).to.be.rejected
  })
  it('should unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage11', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPage ($pageId: ID!) {publishPage (pageId: $pageId) { success } }', { pageId: testpage.id })
    const { unpublishPage: { success } } = await query('mutation UnpublishPage ($pageId: ID!) { unpublishPage (pageId: $pageId) { success } }', { pageId: testpage.id })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.false
  })
  it('should not allow an unauthorized user to unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage12', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPage ($pageId: ID!) {publishPage (pageId: $pageId) { success } }', { pageId: testpage.id })
    await expect(queryAs('ed07', 'mutation UnpublishPage ($pageId: ID!) { unpublishPage (pageId: $pageId) { success } }', { pageId: testpage.id })).to.be.rejected
  })
})
