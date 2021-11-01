/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('pages', () => {
  it('should get pages, filtered by pagetree type', async () => {
    const resp = await query('{ pages(filter: {pageTreeTypes: [SANDBOX]}) { id name pagetree { id type } } }')
    for (const page of resp.data.pages) {
      expect(page.pagetree.type).to.equal('SANDBOX')
    }
  })
  it.skip('should get pages, filtered by assetKeysReferenced', async () => {})
  it('should get deleted pages', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { id name } }')
    const pageNames = resp.data.pages.map((p: any) => p.name)
    expect(pageNames).to.have.members(['events'])
    expect(pageNames).to.not.have.members(['root'])
  })
  it('should get undeleted pages', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { id name } }')
    const pageNames = resp.data.pages.map((p: any) => p.name)
    expect(pageNames).to.not.have.members(['events'])
    expect(pageNames).to.include.members(['about', 'root', 'grad', 'contact'])
  })
  it('should get pages, filtered by linkId', async () => {
    const { data: { pages } } = await query('{ pages(filter: { deleted: false }) { id name linkId } }')
    const linkIds = pages.map((p: any) => p.linkId)
    const resp = await query(`{ pages(filter: {linkIds: ["${linkIds[0]}", "${linkIds[1]}", "${linkIds[2]}", "${linkIds[3]}"] }) { id name linkId} }`)
    expect(resp.data.pages).to.have.lengthOf(4)
    const filteredLinkIds = resp.data.pages.map((p: any) => p.linkId)
    expect(filteredLinkIds).to.have.members([linkIds[0], linkIds[1], linkIds[2], linkIds[3]])
    expect(filteredLinkIds).to.not.have.members([linkIds[4], linkIds[5]])
  })
  it('should get pages, filtered by linkIdsReferenced', async () => {
    const { data: { pages } } = await query('{ pages(filter: { deleted: false }) { id name linkId } }')
    const contactPage = pages.find((p: any) => p.name === 'contact')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    const resp = await query(`{ pages(filter: { linkIdsReferenced: ["${contactPage.linkId}","${staffPage.linkId}"] }) { id name } }`)
    const resultPageNames = resp.data.pages.map((p: any) => p.name)
    expect(resultPageNames).to.have.members(['root', 'location', 'people'])
  })
  it.skip('should get pages, filtered by "live" property', async () => {})
  it('should get pages, filtered by pageTreeId', async () => {
    const resp = await query('{ sites { name pagetrees { id name } } }')
    const site1 = resp.data.sites.find((s: any) => s.name === 'site1')
    const pagetree1 = site1.pagetrees.find((p: any) => p.name === 'pagetree1')
    const site3 = resp.data.sites.find((s: any) => s.name === 'site3')
    const pagetree3 = site3.pagetrees.find((p: any) => p.name === 'pagetree3')
    const { data: { pages } } = await query(`{ pages(filter: { pageTreeIds: [${pagetree1.id},${pagetree3.id}]}) { id name pagetree { id name } } }`)
    for (const page of pages) {
      expect([pagetree1.id, pagetree3.id]).to.include(page.pagetree.id)
    }
  })
  it.skip('should get pages, filtered by "published" property', async () => {})
  it.skip('should get pages, filtered by referencedByPageIds', async () => {})
  it('should get pages, filtered by site ID', async () => {
    const { data: { sites } } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const resp = await query(`{ pages(filter: { siteIds: [${site1.id}] }) { id name } }`)
    const pageNames = resp.data.pages.map((p: any) => p.name)
    expect(pageNames).to.include.members(['location', 'people', 'contact', 'programs'])
    expect(pageNames).to.not.have.members(['sitemap', 'Site 3 Home'])
  })
  it.skip('should get pages using specific templates', async () => {})
  it('should get the ancestors for a page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name ancestors { id name } } }')
    const peoplePage = resp.data.pages.find((p: any) => p.name === 'people')
    const peoplePageAncestors = peoplePage.ancestors.map((a: any) => a.name)
    expect(peoplePageAncestors).to.have.members(['root', 'about'])
    const gradPage = resp.data.pages.find((p: any) => p.name === 'grad')
    const gradPageAncestors = gradPage.ancestors.map((a: any) => a.name)
    expect(gradPageAncestors).to.have.members(['programs', 'root'])
  })
  it('should return an empty array for the ancestors of a root page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name ancestors { id name } } }')
    const rootPage = resp.data.pages.find((p: any) => p.name === 'root')
    expect(rootPage.ancestors).to.have.lengthOf(0)
  })
  it('should get a page\'s direct children', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name children { id name } } }')
    const rootPage = resp.data.pages.find((p: any) => p.name === 'root')
    const rootPageChildren = rootPage.children.map((p: any) => p.name)
    expect(rootPageChildren).to.have.members(['about', 'programs', 'contact'])
  })
  it('should recursively get a page\'s descendents', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name children(recursive:true) { id name } } }')
    const rootPage = resp.data.pages.find((p: any) => p.name === 'root')
    const rootPageDescendents = rootPage.children.map((p: any) => p.name)
    expect(rootPageDescendents).to.include.members(['about', 'people', 'staff'])
  })
  it('should return a page\'s creation datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name createdAt } }')
    const rootPage = resp.data.pages.find((p: any) => p.name === 'root')
    expect(rootPage.createdAt).to.not.be.null
  })
  it('should return the user who created a page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name createdBy { id name } } }')
    const rootPage = resp.data.pages.find((p: any) => p.name === 'root')
    expect(rootPage.createdBy.id).to.equal('su01')
  })
  it.skip('should return the data for a page (no arguments)', async () => {})
  it.skip('should return the published version of data for a page', async () => {})
  it.skip('should return the data for a page, specifying schema version', async () => {})
  it.skip('should return the specified version of data for a page', async () => {})
  it('should return the deleted field for a page', async () => {
    const { data: { sites } } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const { data: { pages } } = await query(`{ pages(filter: { siteIds: [${site1.id}] }) { id name deleted } }`)
    for (const page of pages) {
      expect([true, false]).to.include(page.deleted)
    }
  })
  it('should return a deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { name deletedAt } }')
    const eventsPage = resp.data.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedAt).to.not.be.null
  })
  it('should return null for a non-deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name deletedAt } }')
    const staffPage = resp.data.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedAt).to.be.null
  })
  it('should return the user who deleted a deleted page', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { name deletedBy { id name } } }')
    const eventsPage = resp.data.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedBy.id).to.equal('su01')
  })
  it('should return null for deletedBy if the page is not deleted', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name deletedBy { id name } } }')
    const staffPage = resp.data.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedBy).to.be.null
  })
  it('should return a page\'s linkId', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { id name linkId } }')
    const staffPage = resp.data.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.linkId).to.have.length.greaterThan(0)
  })
  it.skip('should return whether or not a page is live', async () => {})
  it.skip('should return the last modified datetime for a page', async () => {})
  it.skip('should return the user who last modified a page', async () => {})
})
