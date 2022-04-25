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
    const { deletePages: { success, pages } } = await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.true
    expect(pages[0].deletedAt).to.not.be.null
    expect(pages[0].deletedBy.id).to.equal('su01')
  })
  it('should delete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage5a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage5b', testSite6PageRootId, 'keyp3')
    const { page: testpageC } = await createPage('testpage5c', testSite6PageRootId, 'keyp3')
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id, testpageC.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageA.id}", "${testpageB.id}", "${testpageC.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.true
    }
  })
  it('should delete a page and its child pages', async () => {
    const { page: testpageD } = await createPage('testpage5d', testSite6PageRootId, 'keyp3')
    const { page: testpageE } = await createPage('testpage5e', testpageD.id, 'keyp3')
    const { page: testpageF } = await createPage('testpage5f', testpageD.id, 'keyp3')
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageD.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageD.id}", "${testpageE.id}", "${testpageF.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.true
    }
  })
  it('should delete multiple pages and their children', async () => {
    const { page: testpageG } = await createPage('testpage5g', testSite6PageRootId, 'keyp3')
    const { page: testpageH } = await createPage('testpage5h', testpageG.id, 'keyp3')
    const { page: testpageI } = await createPage('testpage5i', testpageG.id, 'keyp3')
    const { page: testpageJ } = await createPage('testpage5j', testSite6PageRootId, 'keyp3')
    const { page: testpageK } = await createPage('testpage5k', testpageJ.id, 'keyp3')
    const { page: testpageL } = await createPage('testpage5l', testpageJ.id, 'keyp3')
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageG.id, testpageJ.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageG.id}", "${testpageH.id}", "${testpageI.id}", "${testpageJ.id}", "${testpageK.id}", "${testpageL.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to delete a page', async () => {
    const { page: testpage } = await createPage('testpage6', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should undelete a page', async () => {
    const { page: testpage } = await createPage('testpage7', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    const { undeletePages: { success, pages } } = await query('mutation UndeletePages ($pageIds: [ID]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.false
    expect(pages[0].deletedAt).to.be.null
    expect(pages[0].deletedBy).to.be.null
  })
  it('should undelete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage7a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage7b', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageA.id}", "${testpageB.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.false
    }
  })
  it('should undelete a page and its children', async () => {
    const { page: testpageC } = await createPage('testpage7c', testSite6PageRootId, 'keyp3')
    const { page: testpageD } = await createPage('testpage7d', testpageC.id, 'keyp3')
    const { page: testpageE } = await createPage('testpage7e', testpageC.id, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageC.id, testpageD.id, testpageE.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageC.id], includeChildren: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageC.id}", "${testpageD.id}", "${testpageE.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.false
    }
  })
  it('should undelete a page, but not its children', async () => {
    const { page: testpageF } = await createPage('testpage7f', testSite6PageRootId, 'keyp3')
    const { page: testpageG } = await createPage('testpage7g', testpageF.id, 'keyp3')
    const { page: testpageH } = await createPage('testpage7h', testpageF.id, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageF.id, testpageG.id, testpageH.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageF.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageF.id}", "${testpageG.id}", "${testpageH.id}"]}) { id deleted } }`)
    for (const p of pages) {
      if (p.id === testpageF.id) expect(p.deleted).to.be.false
      else expect(p.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to undelete a page', async () => {
    const { page: testpage } = await createPage('testpage8', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UndeletePages ($pageIds: [ID]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should publish a page', async () => {
    const { page: testpage } = await createPage('testpage9', testSite6PageRootId, 'keyp3')
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.true
  })
  it('should publish multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage9a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage9b', testSite6PageRootId, 'keyp3')
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpageA.id, testpageB.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageA.id}", "${testpageB.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.true
    }
  })
  it('should publish a page and its child pages', async () => {
    const { page: testpageC } = await createPage('testpage9c', testSite6PageRootId, 'keyp3')
    const { page: testpageD } = await createPage('testpage9d', testpageC.id, 'keyp3')
    const { page: testpageE } = await createPage('testpage9e', testpageC.id, 'keyp3')
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpageC.id], includeChildren: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageC.id}", "${testpageD.id}", "${testpageE.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.true
    }
  })
  it('should not allow an unauthorized user to publish a page', async () => {
    const { page: testpage } = await createPage('testpage10', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation PublishPages ($pageIds: [ID]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage11', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.false
  })
  it('should unpublish multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage11a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage11b', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id, testpageB.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id, testpageB.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageA.id}", "${testpageB.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.false
    }
  })
  it('should not allow an unauthorized user to unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage12', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UnpublishPages ($pageIds: [ID]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })).to.be.rejected
  })
})
