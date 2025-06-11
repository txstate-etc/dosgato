/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import db from 'mysql2-async/db'

chai.use(chaiAsPromised)

async function createPage (name: string, parentId: string, templateKey: string, username?: string, extra?: any) {
  const data = { savedAtVersion: '20220710120000', templateKey, title: 'Test Title', ...extra }
  const { createPage: { success, page, messages } } = await queryAs((username ?? 'su01'), 'mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) { createPage (name: $name, data: $data, targetId: $targetId) { success messages { message } page { id name } } }', { name, targetId: parentId, data })
  return { success, page, messages }
}
async function createPageReturnData (name: string, parentId: string, templateKey: string, username?: string, extra?: any) {
  const data = { savedAtVersion: '20220710120000', templateKey, title: 'Test Title', ...extra }
  const { createPage: { success, page, messages } } = await queryAs<{ createPage: { success: boolean, messages: { message: string }[], page: { id: string, name: string, data: any, version: { version: number } } } }>((username ?? 'su01'), 'mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) { createPage (name: $name, data: $data, targetId: $targetId) { success messages { message } page { id name data version { version } } } }', { name, targetId: parentId, data })
  return { success, page, messages }
}

describe('pages mutations', () => {
  let testSite6Id: string
  let testSite6PageRootId: string
  before(async () => {
    const { sites } = await query('{ sites { id name rootPage { id } } }')
    const site6 = sites.find((s: any) => s.name === 'site6')
    testSite6Id = site6.id
    testSite6PageRootId = site6.rootPage.id
  })
  it('should create a page', async () => {
    const { success, page } = await createPage('testpage1', testSite6PageRootId, 'keyp3')
    expect(success).to.be.true
    expect(page.name).to.equal('testpage1')
  })
  it('should create 10 pages simultaneously', async () => {
    const responses = await Promise.all([
      createPage('concurrentpage1', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage2', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage3', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage4', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage5', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage6', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage7', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage8', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage9', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' }),
      createPage('concurrentpage0', testSite6PageRootId, 'keyp3', undefined, { title: 'Concurrency Problems Sink Ships' })
    ])
    expect(responses.map(r => r.success)).to.deep.equal((Array(10) as boolean[]).fill(true))
  })
  it('should not create a page with blank name or only special characters', async () => {
    const responses = await Promise.all([
      createPage('', testSite6PageRootId, 'keyp3', undefined),
      createPage('   ', testSite6PageRootId, 'keyp3', undefined),
      createPage('$#&*', testSite6PageRootId, 'keyp3', undefined)
    ])
    for (const resp of responses) expect(resp.success).to.be.false
  })
  it('should not allow an unauthorized user to create a page', async () => {
    await expect(createPage('testpage2', testSite6PageRootId, 'keyp3', 'ed07')).to.be.rejected
  })
  it('should create a page with tags and then retrieve it', async () => {
    await createPage('tagtestpage', testSite6PageRootId, 'keyp1', undefined, { title: 'Test Tags' })
    const { pages } = await query<{ pages: { id: string, tags: string[] }[] }>('{ pages (filter: { tagsAny: ["tagtest"] }) { id tags } }')
    expect(pages).to.have.lengthOf(1)
    expect(pages[0].tags).to.deep.equal(['tagtest'])
    const { pages: pages2 } = await query<{ pages: { id: string, tags: string[] }[] }>('{ pages (filter: { tagsAll: ["tagtest"] }) { id tags } }')
    expect(pages2).to.have.lengthOf(1)
    expect(pages2[0].tags).to.deep.equal(['tagtest'])
  })
  it('should rename a page', async () => {
    const { page: testpage } = await createPage('testpage3', testSite6PageRootId, 'keyp3')
    const { renamePage: { success, page } } = await query('mutation UpdatePage ($name: UrlSafeString!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamedtestpage3', pageId: testpage.id })
    expect(success).to.be.true
    expect(page.name).to.equal('renamedtestpage3')
  })
  it('should not allow the root page to be renamed', async () => {
    await expect(query('mutation UpdatePage ($name: UrlSafeString!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamingrootpage', pageId: testSite6PageRootId })).to.be.rejected
  })
  it('should not allow a page to be renamed to blank', async () => {
    const { page: testpage } = await createPage('testpage38', testSite6PageRootId, 'keyp3')
    const { renamePage: { success } } = await query('mutation UpdatePage ($name: UrlSafeString!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success } }', { name: '  ', pageId: testpage.id })
    expect(success).to.be.false
  })
  it('should not allow an unauthorized user to rename a page', async () => {
    const { page: testpage } = await createPage('testpage4', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation UpdatePage ($name: UrlSafeString!, $pageId: ID!) {renamePage (name: $name, pageId: $pageId) { success page { id name } } }', { name: 'renamingrootpage', pageId: testpage.id })).to.be.rejected
  })
  it('should be able to move a page', async () => {
    const { pages } = await query(`
      query getPagesToMove ($page: UrlSafePath!, $parent: UrlSafePath!) {
        pages (filter: { paths: [$page, $parent], pagetreeTypes: [PRIMARY] }) {
          id
          name
        }
      }
    `, { page: '/site1/about/location', parent: '/site1' })
    const toMove = pages.find((p: any) => p.name === 'location')
    const intoPage = pages.find((p: any) => p.name === 'site1')
    const { movePages: { pages: movedPages } } = await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [toMove.id], parentId: intoPage.id })
    expect(movedPages[0].parent.name).to.equal('site1')
  })
  it('should not allow an unauthorized user to move a page', async () => {
    const { page: movingPage } = await createPage('testpage11', testSite6PageRootId, 'keyp3')
    const { page: targetPage } = await createPage('testpage12', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: targetPage.id })).to.be.rejected
  })
  it('should move multiple pages', async () => {
    const { page: firstPageToMove } = await createPage('movingpageA', testSite6PageRootId, 'keyp1')
    const { page: secondPageToMove } = await createPage('movingpageB', testSite6PageRootId, 'keyp1')
    const { page: targetPage } = await createPage('targetpageA', testSite6PageRootId, 'keyp1')
    const { movePages: { success, pages } } = await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { success pages { name, parent { name } } } }', { pageIds: [firstPageToMove.id, secondPageToMove.id], parentId: targetPage.id })
    expect(success).to.be.true
    for (const p of pages) {
      expect(p.parent.name).to.equal('targetpagea')
    }
    const movedPages = await db.getall('SELECT dataId, displayOrder FROM pages where dataId IN (?,?) ORDER BY displayOrder', [firstPageToMove.id, secondPageToMove.id])
    expect(String(movedPages[0].dataId)).to.equal(firstPageToMove.id)
  })
  it('should not move a page into its own subtree', async () => {
    const { page: topPage } = await createPage('movingpageC', testSite6PageRootId, 'keyp2')
    const { page: middlePage } = await createPage('otherpage', topPage.id, 'keyp2')
    const { page: deepestPage } = await createPage('targetpageB', middlePage.id, 'keyp2')
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [topPage.id], parentId: deepestPage.id })).to.be.rejected
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [topPage.id], parentId: middlePage.id })).to.be.rejected
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [topPage.id], parentId: topPage.id })).to.be.rejected
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [deepestPage.id], parentId: deepestPage.id })).to.be.rejected
  })
  it('should not move a page to a different site', async () => {
    const { page: movingPage } = await createPage('movingpageD', testSite6PageRootId, 'keyp1')
    const { pages: pagelist } = await query('{ pages(filter: { deleteStates: [NOTDELETED, MARKEDFORDELETE] }) { id name } }')
    const site4rootpage = pagelist.find((p: any) => p.name === 'site4')
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: site4rootpage.id })).to.be.rejected
  })
  it('should not move a page to a different pagetree', async () => {
    const { sites } = await query('{ sites { id name pagetrees {id name rootPage { id } } } }')
    const site3 = sites.find((s: any) => s.name === 'site3')
    const site3primary = site3.pagetrees.find((p: any) => p.name === 'site3')
    const site3sandbox = site3.pagetrees.find((p: any) => p.name === 'site3-sandbox')
    const { page: movingPage } = await createPage('movingpageE', site3primary.rootPage.id, 'keyp1')
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: site3sandbox.rootPage.id })).to.be.rejected
  })
  it('should move a page above another page', async () => {
    const { page: targetPage } = await createPage('targetpageC', testSite6PageRootId, 'keyp3')
    const { page: movingPage } = await createPage('movingpageF', testSite6PageRootId, 'keyp3')
    const { movePages: { success } } = await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean) { movePages (pageIds: $pageIds, targetId: $parentId, above: $above) { success pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: targetPage.id, above: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${movingPage.id}","${targetPage.id}"] }) { id } }`)
    expect(pages[0].id).to.equal(movingPage.id)
  })
  it('should move multiple pages above another page', async () => {
    const { page: targetPage } = await createPage('targetpageD', testSite6PageRootId, 'keyp1')
    const { page: firstPageToMove } = await createPage('movingpageG', testSite6PageRootId, 'keyp1')
    const { page: secondPageToMove } = await createPage('movingpageH', testSite6PageRootId, 'keyp1')
    const { movePages: { success } } = await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean) { movePages (pageIds: $pageIds, targetId: $parentId, above: $above) { success pages { name, parent { name } } } }', { pageIds: [firstPageToMove.id, secondPageToMove.id], parentId: targetPage.id, above: true })
    expect(success).to.be.true
    const pages = await db.getall('SELECT * FROM pages WHERE dataId IN (?,?,?) order by displayOrder', [targetPage.id, firstPageToMove.id, secondPageToMove.id])
    const displayOrders: Record<string, number> = {}
    for (const page of pages) {
      displayOrders[page.name] = page.displayOrder
    }
    expect(displayOrders.movingpageh).to.equal(displayOrders.movingpageg + 1)
    expect(displayOrders.targetpaged).to.equal(displayOrders.movingpageg + 2)
  })
  it('should not leave holes behind when pages are moved', async () => {
    const { page: originalParent } = await createPage('originalparent', testSite6PageRootId, 'keyp1')
    const { page: firstchild } = await createPage('firstchildpage', originalParent.id, 'keyp1')
    const { page: secondchild } = await createPage('secondchildpage', originalParent.id, 'keyp1')
    const { page: thirdchild } = await createPage('thirdchildpage', originalParent.id, 'keyp1')
    await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { success pages { name, parent { name } } } }', { pageIds: [secondchild.id], parentId: testSite6PageRootId })
    const parentrow = await db.getrow('SELECT id, path FROM pages WHERE dataId = ?', originalParent.id)
    const remaining = await db.getall('SELECT * FROM pages WHERE path = ? ORDER BY displayOrder', [`${parentrow.path}/${parentrow.id}`])
    expect(String(remaining[0].dataId)).to.equal(firstchild.id)
    expect(String(remaining[1].dataId)).to.equal(thirdchild.id)
    expect(remaining[0].displayOrder).to.equal(1)
    expect(remaining[1].displayOrder).to.equal(2)
  })
  it('should order moved pages based on their display order before they were moved', async () => {
    const { page: parentA } = await createPage('parentpageA', testSite6PageRootId, 'keyp1')
    const { page: parentB } = await createPage('parentpageB', testSite6PageRootId, 'keyp1')
    const { page: parentC } = await createPage('parentpageC', testSite6PageRootId, 'keyp1')
    const { page: parentD } = await createPage('parentpageD', testSite6PageRootId, 'keyp1')
    const { page: pageA1 } = await createPage('childpageA1', parentA.id, 'keyp1')
    const { page: pageA2 } = await createPage('childpageA2', parentA.id, 'keyp1')
    const { page: pageB1 } = await createPage('childpageB1', parentB.id, 'keyp1')
    const { page: pageB2 } = await createPage('childpageB2', parentB.id, 'keyp1')
    const { page: pageB3 } = await createPage('childpageB3', parentB.id, 'keyp1')
    const { page: pageC1 } = await createPage('childpageC1', parentC.id, 'keyp1')
    const { page: pageC2 } = await createPage('childpageC2', parentC.id, 'keyp1')
    const { page: pageC3 } = await createPage('childpageC3', parentC.id, 'keyp1')
    const { page: pageC4 } = await createPage('childpageC4', parentC.id, 'keyp1')
    const { page: pageD1 } = await createPage('childpageD1', parentD.id, 'keyp1')
    const { movePages: { success } } = await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { success pages { name, parent { name } } } }', { pageIds: [pageA2.id, pageB1.id, pageC1.id, pageC4.id], parentId: parentD.id })
    expect(success).to.be.true
    const parentrow = await db.getrow('SELECT id, path FROM pages WHERE dataId = ?', parentD.id)
    const children = await db.getall('SELECT * FROM pages WHERE path = ? ORDER BY displayOrder', [`${parentrow.path}/${parentrow.id}`])
    const displayOrders: Record<string, number> = {}
    for (const page of children) {
      displayOrders[page.name] = page.displayOrder
    }
    expect(displayOrders.childpageb1).to.be.lessThan(displayOrders.childpagea2)
    expect(displayOrders.childpagec1).to.be.lessThan(displayOrders.childpagea2)
    expect(displayOrders.childpagea2).to.be.lessThan(displayOrders.childpagec4)
  })
  it('should copy a page', async () => {
    const { page: pagetocopy } = await createPage('copytestpage1', testSite6PageRootId, 'keyp1')
    const { page: copytarget } = await createPage('copytestpage2', testSite6PageRootId, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!) { copyPages (pageIds: $pageIds, targetId: $parentId) { success page { id name, parent { name } } } }', { pageIds: [pagetocopy.id], parentId: copytarget.id })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${copytarget.id}", "${pagetocopy.id}"] }) { id parent { id name } children { id name } } }`)
    for (const page of pages) {
      if (page.id === pagetocopy.id) expect(page.parent.id).to.equal(testSite6PageRootId)
      if (page.id === copytarget.id) {
        expect(page.children[0].name).to.equal('copytestpage1')
      }
    }
  })
  it('should copy multiple pages', async () => {
    const { page: pagetocopy } = await createPage('copytestpage3', testSite6PageRootId, 'keyp1')
    const { page: anotherpagetocopy } = await createPage('copytestpage4', testSite6PageRootId, 'keyp1')
    const { page: copytarget } = await createPage('copytestpage5', testSite6PageRootId, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!) { copyPages (pageIds: $pageIds, targetId: $parentId) { success page { id name } } }', { pageIds: [pagetocopy.id, anotherpagetocopy.id], parentId: copytarget.id })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${copytarget.id}"]}) { children { id name } } }`)
    expect(pages[0].children.map((p: any) => p.name)).to.have.members(['copytestpage3', 'copytestpage4'])
    expect(pages[0].children.map((p: any) => p.id)).to.not.include([pagetocopy.id, anotherpagetocopy.id])
  })
  it('should copy a page above another page', async () => {
    const { page: copytarget } = await createPage('copytestpage6', testSite6PageRootId, 'keyp1')
    const { page: pagetocopy } = await createPage('copytestpage7', copytarget.id, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean) { copyPages (pageIds: $pageIds, targetId: $parentId, above: $above) { success page { id name } } }', { pageIds: [pagetocopy.id], parentId: copytarget.id, above: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testSite6PageRootId}"]}) { children { id name } } }`)
    expect(pages[0].children.map((p: any) => p.name)).to.include('copytestpage7')
  })
  it('should copy multiple pages above another page', async () => {
    const { page: copytarget } = await createPage('copytestpage8', testSite6PageRootId, 'keyp1')
    const { page: pagetocopy } = await createPage('copytestpage9', copytarget.id, 'keyp1')
    const { page: anotherpagetocopy } = await createPage('copytestpage10', copytarget.id, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean) { copyPages (pageIds: $pageIds, targetId: $parentId, above: $above) { success page { id name } } }', { pageIds: [pagetocopy.id, anotherpagetocopy.id], parentId: copytarget.id, above: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testSite6PageRootId}", "${copytarget.id}"]}) { children { id name } } }`)
    expect(pages.length).to.equal(2)
    for (const page of pages) {
      expect(page.children.map((p: any) => p.name)).to.include.members(['copytestpage9', 'copytestpage10'])
    }
  })
  it('should copy a page and its children', async () => {
    const { page: copytarget } = await createPage('copytestpage11', testSite6PageRootId, 'keyp1')
    const { page: pagetocopy } = await createPage('copytestpage12', testSite6PageRootId, 'keyp1')
    const { page: childpagetocopy } = await createPage('copytestpage13', pagetocopy.id, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean, $includeChildren: Boolean) { copyPages (pageIds: $pageIds, targetId: $parentId, above: $above, includeChildren: $includeChildren) { success page { id name } } }', { pageIds: [pagetocopy.id], parentId: copytarget.id, includeChildren: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testSite6PageRootId}", "${copytarget.id}"]}) { children(recursive: true) { id name parent { name } } } }`)
    for (const page of pages) {
      expect(page.children.map((p: any) => p.name)).to.include.members(['copytestpage12', 'copytestpage13'])
      for (const child of page.children) {
        if (child.name === 'copytestpage13') expect(child.parent.name).to.equal('copytestpage12')
      }
    }
  })
  it('should copy multiple pages and their children', async () => {
    const { page: copytarget } = await createPage('copytestpage14', testSite6PageRootId, 'keyp1')
    const { page: pagetocopy } = await createPage('copytestpage15', testSite6PageRootId, 'keyp1')
    const { page: childpagetocopy } = await createPage('copytestpage16', pagetocopy.id, 'keyp1')
    const { page: anotherpagetocopy } = await createPage('copytestpage17', testSite6PageRootId, 'keyp1')
    const { page: anotherchildpagetocopy } = await createPage('copytestpage18', anotherpagetocopy.id, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!, $above: Boolean, $includeChildren: Boolean) { copyPages (pageIds: $pageIds, targetId: $parentId, above: $above, includeChildren: $includeChildren) { success page { id name } } }', { pageIds: [pagetocopy.id, anotherpagetocopy.id], parentId: copytarget.id, includeChildren: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testSite6PageRootId}", "${copytarget.id}"]}) { children(recursive: true) { id name parent { name } } } }`)
    for (const page of pages) {
      expect(page.children.map((p: any) => p.name)).to.include.members(['copytestpage15', 'copytestpage16', 'copytestpage17', 'copytestpage18'])
    }
  })
  it('should append a number to the end of a page name if its copy destination already has a page with that name', async () => {
    const { page: copytarget } = await createPage('copytestpage19', testSite6PageRootId, 'keyp1')
    const { page: pagetocopy } = await createPage('pagename', testSite6PageRootId, 'keyp1')
    const { page: pagewithsamename } = await createPage('pagename', copytarget.id, 'keyp1')
    const { copyPages: { success } } = await query('mutation copyPages ($pageIds: [ID!]!, $parentId: ID!) { copyPages (pageIds: $pageIds, targetId: $parentId) { success page { id name children { name } } } }', { pageIds: [pagetocopy.id], parentId: copytarget.id })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${copytarget.id}"]}) { children { id name } } }`)
    expect(pages[0].children.map((p: any) => p.name)).to.include.members(['pagename', 'pagename-1'])
  })
  it('should delete a page', async () => {
    const { page: testpage } = await createPage('testpage5', testSite6PageRootId, 'keyp3')
    const { deletePages: { success, pages } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.true
    expect(pages[0].deletedAt).to.not.be.null
    expect(pages[0].deletedBy.id).to.equal('su01')
  })
  it('should delete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage5a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage5b', testSite6PageRootId, 'keyp3')
    const { page: testpageC } = await createPage('testpage5c', testSite6PageRootId, 'keyp3')
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageA.id, testpageB.id, testpageC.id] })
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
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageD.id] })
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
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageG.id, testpageJ.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageG.id}", "${testpageH.id}", "${testpageI.id}", "${testpageJ.id}", "${testpageK.id}", "${testpageL.id}"]}) { id deleted } }`)
    for (const p of pages) {
      expect(p.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to delete a page', async () => {
    const { page: testpage } = await createPage('testpage6', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should undelete a page', async () => {
    const { page: testpage } = await createPage('testpage7', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpage.id] })
    const { undeletePages: { success, pages } } = await query('mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.false
    expect(pages[0].deletedAt).to.be.null
    expect(pages[0].deletedBy).to.be.null
  })
  it('should undelete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage7a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage7b', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageA.id, testpageB.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageA.id, testpageB.id] })
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
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageC.id, testpageD.id, testpageE.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageC.id], includeChildren: true })
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
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageF.id, testpageG.id, testpageH.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageF.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageF.id}", "${testpageG.id}", "${testpageH.id}"]}) { id deleted } }`)
    for (const p of pages) {
      if (p.id === testpageF.id) expect(p.deleted).to.be.false
      else expect(p.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to undelete a page', async () => {
    const { page: testpage } = await createPage('testpage8', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should publish a page', async () => {
    const { page: testpage } = await createPage('testpage9', testSite6PageRootId, 'keyp3')
    const { pages: beforePages } = await query(`{ pages(filter: { ids: ["${testpage.id}"], published: true }) { id name published }}`)
    const { pages: beforePages2 } = await query(`{ pages(filter: { ids: ["${testpage.id}"], published: false }) { id name published }}`)
    expect(beforePages).to.have.lengthOf(0)
    expect(beforePages2).to.have.lengthOf(1)
    expect(beforePages2[0].published).to.be.false
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    const { pages: afterPages } = await query(`{ pages(filter: { ids: ["${testpage.id}"], published: true }) { id name published }}`)
    expect(afterPages).to.have.lengthOf(1)
    expect(afterPages[0].published).to.be.true
  })
  it('should publish multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage9a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage9b', testSite6PageRootId, 'keyp3')
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpageA.id, testpageB.id] })
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
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpageC.id], includeChildren: true })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageC.id}", "${testpageD.id}", "${testpageE.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.true
    }
  })
  it('should not allow an unauthorized user to publish a page', async () => {
    const { page: testpage } = await createPage('testpage10', testSite6PageRootId, 'keyp3')
    await expect(queryAs('ed07', 'mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage11c', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID!]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.false
  })
  it('should unpublish multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage11a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage11b', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID!]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id, testpageB.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id, testpageB.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageA.id}", "${testpageB.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.false
    }
  })
  it('should unpublish a page with a subpage marked for deletion', async () => {
    const { page: testpageA } = await createPage('testpage11d', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage11e', testpageA.id, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID!]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id], includeChildren: true })
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id firstname lastname } } } }', { pageIds: [testpageB.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpageA.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpageA.id}", "${testpageB.id}"] }) { id name published }}`)
    for (const p of pages) {
      expect(p.published).to.be.false
    }
  })
  it('should not unpublish a live root page', async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootPage { id } } } }', { name: 'unpublishtestsite_a', data: { templateKey: 'keyp1', savedAtVersion: '20220801120000', title: 'Root Page Title' } })
    await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [site.rootPage.id] })
    await query('mutation SetLaunchURL ($id: ID!, $host: String!, $path: String!, $enabled: LaunchState!, $validateOnly: Boolean) { setLaunchURL (siteId:$id, host: $host, path: $path, enabled: $enabled, validateOnly: $validateOnly) { success } }', { id: site.id, host: 'www.example.com', path: '/unpublishtestsite_a/', enabled: 'LAUNCHED', validateOnly: false })
    try {
      await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [site.rootPage.id] })
      expect.fail('Unpublishing a live root page should throw.')
    } catch (e: any) {
      expect(e.message).to.include('not permitted to unpublish')
    }
  })
  it('should unpublish a root page that is not live', async () => {
    const { createSite: { site } } = await query('mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) { createSite (name: $name, data: $data) { success site { id name rootPage { id } } } }', { name: 'unpublishtestsite_b', data: { templateKey: 'keyp1', savedAtVersion: '20220801120000', title: 'Root Page Title' } })
    await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [site.rootPage.id] })
    const { unpublishPages: { success } } = await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [site.rootPage.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${site.rootPage.id}"] }) { id name published} }`)
    expect(pages[0].published).to.be.false
  })
  it('should not allow an unauthorized user to unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage12a', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID!]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should update a page', async () => {
    const { page } = await createPageReturnData('testpage13', testSite6PageRootId, 'keyp2')
    const { updatePage } = await query<{ updatePage: { success: boolean, page: { data: any, version: { version: number } } } }>(`
      mutation updatePage ($pageId: ID!, $data: JsonData!, $dataVersion: Int!) {
        updatePage (pageId: $pageId, data: $data, dataVersion: $dataVersion) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, { pageId: page.id, dataVersion: page.version.version, data: { ...page.data, areas: { content: [{ templateKey: 'keyc1', text: 'Link', link: '{ "type": "raw", "url": "http://www.google.com" }' }] } } })
    expect(updatePage.success).to.be.true
    expect(page.version.version === updatePage.page.version.version - 1)
    expect(page.data).to.not.deep.equal(updatePage.page.data)
  })
  const createPageComponentQuery = `
    mutation createPageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $path: String!, $data: JsonData!, $isCopy: Boolean, $comment: String, $validateOnly: Boolean, $addToTop: Boolean) {
      createPageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, path: $path, data: $data, isCopy: $isCopy, comment: $comment, validateOnly: $validateOnly, addToTop: $addToTop) {
        success
        messages {
          type
        }
        page {
          data
          version { version }
        }
      }
    }
  `
  interface PageComponentResponse {
    success: boolean
    messages: { type: string }[]
    page: { data: any, version: { version: number } }
  }
  interface CreatePageComponentResponse {
    createPageComponent: PageComponentResponse
  }
  it('should add a new component to the bottom of an area by default', async () => {
    const { page: testPage } = await createPageReturnData('testpage20', testSite6PageRootId, 'keyp2')
    await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: testPage.id,
      dataVersion: testPage.version.version,
      schemaversion: testPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1', text: 'First Link Added', link: '{ "type": "raw", "url": "https://apple.com" }' }
    })
    const { createPageComponent: { success, page } } = await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: testPage.id,
      dataVersion: testPage.version.version + 1,
      schemaversion: testPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1', text: 'Second Link Added', link: '{ "type": "raw", "url": "https://bbc.com" }' }
    })
    expect(success).to.be.true
    expect(page.data.areas.main.length).to.equal(2)
    expect(page.data.areas.main[0].text).to.equal('First Link Added')
    expect(page.data.areas.main[1].text).to.equal('Second Link Added')
  })
  it('should be able to add a new component to the top of an area', async () => {
    const { page: testPage } = await createPageReturnData('testpage21', testSite6PageRootId, 'keyp2')
    await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: testPage.id,
      dataVersion: testPage.version.version,
      schemaversion: testPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1', text: 'First Link Added', link: '{ "type": "raw", "url": "https://apple.com" }' }
    })
    const { createPageComponent: { success, page } } = await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: testPage.id,
      dataVersion: testPage.version.version + 1,
      schemaversion: testPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1', text: 'Second Link Added', link: '{ "type": "raw", "url": "https://bbc.com" }' },
      addToTop: true
    })
    expect(success).to.be.true
    expect(page.data.areas.main.length).to.equal(2)
    expect(page.data.areas.main[0].text).to.equal('Second Link Added')
    expect(page.data.areas.main[1].text).to.equal('First Link Added')
  })
  it('should allow adding a single component to a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { createPageComponent: { success, messages, page } } = await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1', text: 'Added Link', link: '{ "type": "raw", "url": "https://bing.com" }' }
    })
    expect(success).to.be.true
    expect(messages.length).to.equal(0)
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.data.areas.main.length).to.equal(2)
    expect(page.data.areas.main[1].text).to.equal('Added Link')
    expect(page.version.version + 1 === oldPage.version.version)
  })
  it('should reject adding a single component that has validation errors', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { createPageComponent: { success, messages, page } } = await query<CreatePageComponentResponse>(createPageComponentQuery, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      path: 'areas.main',
      data: { templateKey: 'keyc1' }
    })
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
    expect(page.data).to.deep.equal(oldPage.data)
    expect(page.version.version === oldPage.version.version)
  })
  it('should reject adding a single component that is incompatible with its parent', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    try {
      const { createPageComponent: { success, messages, page } } = await query<CreatePageComponentResponse>(createPageComponentQuery, {
        pageId: oldPage.id,
        dataVersion: oldPage.version.version,
        schemaversion: oldPage.data.savedAtVersion,
        path: 'areas.main',
        data: { templateKey: 'textimage', title: 'Text Image', text: 'Not allowed.' }
      })
      expect.fail('Adding a text & image to the validation page should throw.')
    } catch (e: any) {
      expect(e.message).to.include('not compatible')
    }
  })
  it('should allow updating a component on a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { updatePageComponent: { success, messages, page } } = await query<{ updatePageComponent: PageComponentResponse }>(`
      mutation updatePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $path: String!, $data: JsonData!) {
        updatePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, path: $path, data: $data) {
          success
          messages {
            type
          }
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      path: 'areas.main.1',
      data: { templateKey: 'keyc1', text: 'Added Link Edited', link: '{ "type": "raw", "url": "https://bing.com" }' }
    })
    expect(success).to.be.true
    expect(messages.length).to.equal(0)
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.data.areas.main.length).to.equal(2)
    expect(page.data.areas.main[1].text).to.equal('Added Link Edited')
    expect(page.version.version + 1 === oldPage.version.version)
  })
  it('should reject updating a component that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { updatePageComponent: { success, messages, page } } = await query<{ updatePageComponent: PageComponentResponse }>(`
      mutation updatePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $path: String!, $data: JsonData!) {
        updatePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, path: $path, data: $data) {
          success
          messages {
            type
          }
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      path: 'areas.main.1',
      data: { templateKey: 'keyc1', text: 'Removed HREF' }
    })
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
    expect(page.data).to.deep.equal(oldPage.data)
    expect(page.data.areas.main.length).to.equal(2)
    expect(page.data.areas.main[1].text).to.equal('Added Link Edited')
    expect(page.version.version === oldPage.version.version)
  })
  it('should allow moving a component down in its own area, on a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { movePageComponent: { success, page } } = await query<{ movePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation movePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $fromPath: String!, $toPath: String!) {
        movePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, fromPath: $fromPath, toPath: $toPath) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      fromPath: 'areas.main.0',
      toPath: 'areas.main.1'
    })
    expect(success).to.be.true
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.data.areas.main[0].text).to.equal('Added Link Edited')
    expect(page.version.version - 1 === oldPage.version.version)
  })
  it('should allow moving a component up in its own area, on a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { movePageComponent: { success, page } } = await query<{ movePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation movePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $fromPath: String!, $toPath: String!) {
        movePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, fromPath: $fromPath, toPath: $toPath) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      fromPath: 'areas.main.1',
      toPath: 'areas.main.0'
    })
    expect(success).to.be.true
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.data.areas.main[1].text).to.equal('Added Link Edited')
    expect(page.version.version - 1 === oldPage.version.version)
  })
  it('should allow moving a component to the bottom of an area, on a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { movePageComponent: { success, page } } = await query<{ movePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation movePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $fromPath: String!, $toPath: String!) {
        movePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, fromPath: $fromPath, toPath: $toPath) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      fromPath: 'areas.main.0',
      toPath: 'areas.main'
    })
    expect(success).to.be.true
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.data.areas.main[0].text).to.equal('Added Link Edited')
    expect(page.version.version - 1 === oldPage.version.version)
  })
  it('should allow deleting a component from a page that has validation errors.', async () => {
    const { pages } = await query('{ pages (filter: { paths: ["/site8/validation-error-page"] }) { id data version { version } } }')
    const oldPage = pages[0]
    const { deletePageComponent: { success, page } } = await query<{ deletePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation deletePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $path: String!) {
        deletePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, path: $path) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: oldPage.id,
      dataVersion: oldPage.version.version,
      schemaversion: oldPage.data.savedAtVersion,
      path: 'areas.main.0'
    })
    expect(success).to.be.true
    expect(page.data).to.not.deep.equal(oldPage.data)
    expect(page.version.version - 1 === oldPage.version.version)
  })
  it('should allow moving a component between sibling containers', async () => {
    const p = await createPageReturnData('move-component-test', testSite6PageRootId, 'keyp1', 'su01', {
      areas: {
        main: [
          {
            templateKey: 'keyc2',
            title: 'first panel',
            areas: {
              content: [
                {
                  templateKey: 'keyc3',
                  quote: 'this is a quote',
                  author: 'famous author'
                }
              ]
            }
          }, {
            templateKey: 'keyc2'
          }
        ]
      }
    })
    const { movePageComponent: { success, page } } = await query<{ movePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation movePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $fromPath: String!, $toPath: String!) {
        movePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, fromPath: $fromPath, toPath: $toPath) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: p.page.id,
      dataVersion: p.page.version.version,
      schemaversion: p.page.data.savedAtVersion,
      fromPath: 'areas.main.0.areas.content.0',
      toPath: 'areas.main.1.areas.content'
    })
    expect(success).to.be.true
    const { movePageComponent: { success: success2, page: page2 } } = await query<{ movePageComponent: { success: true, page: { version: { version: number }, data: any } } }>(`
      mutation movePageComponent ($pageId: ID!, $dataVersion: Int!, $schemaversion: SchemaVersion!, $fromPath: String!, $toPath: String!) {
        movePageComponent (pageId: $pageId, dataVersion: $dataVersion, schemaversion: $schemaversion, fromPath: $fromPath, toPath: $toPath) {
          success
          page {
            data
            version { version }
          }
        }
      }
    `, {
      pageId: p.page.id,
      dataVersion: p.page.version.version + 1,
      schemaversion: p.page.data.savedAtVersion,
      fromPath: 'areas.main.1.areas.content.0',
      toPath: 'areas.main.0.areas.content.0'
    })
    expect(success2).to.be.true
  })
  it('should be able to add an external URL link to a page, search for it, and get it back on externalLinks property', async () => {
    const { page: testPage } = await createPageReturnData('testpage22', testSite6PageRootId, 'keyp2', 'su01', {
      areas: {
        main: [
          {
            templateKey: 'keyc2',
            title: 'first panel',
            areas: {
              content: [
                {
                  templateKey: 'keyc1',
                  text: 'external link',
                  link: JSON.stringify({ type: 'url', url: 'https://www.external-test-example.com' })
                }
              ]
            }
          }
        ]
      }
    })
    const { pages } = await query<{ pages: { id: string, externalLinks: string[] }[] }>('{ pages(filter: { hostsReferenced: ["www.external-test-example.com"] }) { id externalLinks } }')
    expect(pages[0].id).to.equal(testPage.id)
    expect(pages.length).to.equal(1)
    expect(pages[0].externalLinks).to.include('https://www.external-test-example.com')
  })
})
