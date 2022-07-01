/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import db from 'mysql2-async/db'

chai.use(chaiAsPromised)

async function createPage (name: string, parentId: string, templateKey: string, username?: string) {
  const { createPage: { success, page, messages } } = await queryAs((username ?? 'su01'), 'mutation CreatePage ($name: UrlSafeString!, $templateKey: ID!, $targetId: ID!) { createPage (name: $name, templateKey: $templateKey, targetId: $targetId) { success messages { message } page { id name } } }', { name, targetId: parentId, templateKey })
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
      expect(p.parent.name).to.equal('targetpageA')
    }
    const movedPages = await db.getall('SELECT dataId, displayOrder FROM pages where dataId IN (?,?) ORDER BY displayOrder', [firstPageToMove.id, secondPageToMove.id])
    expect(movedPages[0].dataId).to.equal(firstPageToMove.id)
  })
  it('should not move a page into its own subtree', async () => {
    const { page: movingPage } = await createPage('movingpageC', testSite6PageRootId, 'keyp2')
    const { page: middlePage } = await createPage('otherpage', movingPage.id, 'keyp2')
    const { page: targetPage } = await createPage('targetpageB', middlePage.id, 'keyp2')
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: targetPage.id })).to.be.rejected
  })
  it('should not move a page to a different site', async () => {
    const { page: movingPage } = await createPage('movingpageD', testSite6PageRootId, 'keyp1')
    const { pages: pagelist } = await query('{ pages(filter: { deleted: HIDE }) { id name } }')
    const site4rootpage = pagelist.find((p: any) => p.name === 'site4')
    await expect(query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { pages { name, parent { name } } } }', { pageIds: [movingPage.id], parentId: site4rootpage.id })).to.be.rejected
  })
  it('should not move a page to a different pagetree', async () => {
    const { sites } = await query('{ sites { id name pagetrees {id name rootPage { id } } } }')
    const site3 = sites.find((s: any) => s.name === 'site3')
    const site3primary = site3.pagetrees.find((p: any) => p.name === 'pagetree3')
    const site3sandbox = site3.pagetrees.find((p: any) => p.name === 'pagetree3sandbox')
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
    expect(displayOrders.movingpageH).to.equal(displayOrders.movingpageG + 1)
    expect(displayOrders.targetpageD).to.equal(displayOrders.movingpageG + 2)
  })
  it('should not leave holes behind when pages are moved', async () => {
    const { page: originalParent } = await createPage('originalparent', testSite6PageRootId, 'keyp1')
    const { page: firstchild } = await createPage('firstchildpage', originalParent.id, 'keyp1')
    const { page: secondchild } = await createPage('secondchildpage', originalParent.id, 'keyp1')
    const { page: thirdchild } = await createPage('thirdchildpage', originalParent.id, 'keyp1')
    await query('mutation movePages ($pageIds: [ID!]!, $parentId: ID!) { movePages (pageIds: $pageIds, targetId: $parentId) { success pages { name, parent { name } } } }', { pageIds: [secondchild.id], parentId: testSite6PageRootId })
    const parentrow = await db.getrow('SELECT id, path FROM pages WHERE dataId = ?', originalParent.id)
    const remaining = await db.getall('SELECT * FROM pages WHERE path = ? ORDER BY displayOrder', [`${parentrow.path}/${parentrow.id}`])
    expect(remaining[0].dataId).to.equal(firstchild.id)
    expect(remaining[1].dataId).to.equal(thirdchild.id)
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
    expect(displayOrders.childpageB1).to.be.lessThan(displayOrders.childpageA2)
    expect(displayOrders.childpageC1).to.be.lessThan(displayOrders.childpageA2)
    expect(displayOrders.childpageA2).to.be.lessThan(displayOrders.childpageC4)
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
    expect(pages[0].children.map((p: any) => p.name)).to.include.members(['pagename', 'pagename0'])
  })
  it('should delete a page', async () => {
    const { page: testpage } = await createPage('testpage5', testSite6PageRootId, 'keyp3')
    const { deletePages: { success, pages } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.true
    expect(pages[0].deletedAt).to.not.be.null
    expect(pages[0].deletedBy.id).to.equal('su01')
  })
  it('should delete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage5a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage5b', testSite6PageRootId, 'keyp3')
    const { page: testpageC } = await createPage('testpage5c', testSite6PageRootId, 'keyp3')
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id, testpageC.id] })
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
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageD.id] })
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
    const { deletePages: { success } } = await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageG.id, testpageJ.id] })
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
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    const { undeletePages: { success, pages } } = await query('mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    expect(pages[0].deleted).to.be.false
    expect(pages[0].deletedAt).to.be.null
    expect(pages[0].deletedBy).to.be.null
  })
  it('should undelete multiple pages', async () => {
    const { page: testpageA } = await createPage('testpage7a', testSite6PageRootId, 'keyp3')
    const { page: testpageB } = await createPage('testpage7b', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageA.id, testpageB.id] })
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
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageC.id, testpageD.id, testpageE.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageC.id], includeChildren: true })
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
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageF.id, testpageG.id, testpageH.id] })
    const { undeletePages: { success } } = await query('mutation UndeletePages ($pageIds: [ID!]!, $includeChildren: Boolean) {undeletePages (pageIds: $pageIds, includeChildren: $includeChildren) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpageF.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: {ids: ["${testpageF.id}", "${testpageG.id}", "${testpageH.id}"]}) { id deleted } }`)
    for (const p of pages) {
      if (p.id === testpageF.id) expect(p.deleted).to.be.false
      else expect(p.deleted).to.be.true
    }
  })
  it('should not allow an unauthorized user to undelete a page', async () => {
    const { page: testpage } = await createPage('testpage8', testSite6PageRootId, 'keyp3')
    await query('mutation DeletePages ($pageIds: [ID!]!) {deletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UndeletePages ($pageIds: [ID!]!) {undeletePages (pageIds: $pageIds) { success pages { id name deleted deletedAt deletedBy { id name } } } }', { pageIds: [testpage.id] })).to.be.rejected
  })
  it('should publish a page', async () => {
    const { page: testpage } = await createPage('testpage9', testSite6PageRootId, 'keyp3')
    const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID!]!, $includeChildren: Boolean) {publishPages (pageIds: $pageIds, includeChildren: $includeChildren) { success } }', { pageIds: [testpage.id] })
    expect(success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${testpage.id}"] }) { id name published }}`)
    expect(pages[0].published).to.be.true
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
    const { page: testpage } = await createPage('testpage11', testSite6PageRootId, 'keyp3')
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
  it('should not allow an unauthorized user to unpublish a page', async () => {
    const { page: testpage } = await createPage('testpage12', testSite6PageRootId, 'keyp3')
    await query('mutation PublishPages ($pageIds: [ID!]!) {publishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })
    await expect(queryAs('ed07', 'mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [testpage.id] })).to.be.rejected
  })
})
