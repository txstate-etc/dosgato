/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('pages', () => {
  it('should get pages, filtered by id', async () => {
    const { pages } = await query('{ pages(filter: { deleted: false }) { id name } }')
    const ids = pages.map((p: any) => p.id)
    const resp = await query(`{ pages(filter: {ids: ["${ids[0]}", "${ids[1]}", "${ids[2]}"] }) { id name} }`)
    expect(resp.pages).to.have.lengthOf(3)
    const pageIds = resp.pages.map((p: any) => p.id)
    expect(pageIds).to.have.members([ids[0], ids[1], ids[2]])
    expect(pageIds).to.not.have.members([ids[3], ids[4], ids[5]])
  })
  it.skip('should get pages filtered by links', async () => {})
  it('should get pages, filtered by pagetree type', async () => {
    const resp = await query('{ pages(filter: {pagetreeTypes: [SANDBOX]}) { id name pagetree { id type } } }')
    for (const page of resp.pages) {
      expect(page.pagetree.type).to.equal('SANDBOX')
    }
  })
  it.skip('should get pages, filtered by assetKeysReferenced', async () => {})
  it('should get deleted pages', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { id name } }')
    const pageNames = resp.pages.map((p: any) => p.name)
    expect(pageNames).to.have.members(['events'])
    expect(pageNames).to.not.have.members(['root'])
  })
  it('should get undeleted pages', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { id name } }')
    const pageNames = resp.pages.map((p: any) => p.name)
    expect(pageNames).to.not.have.members(['events'])
    expect(pageNames).to.include.members(['about', 'site1', 'grad', 'contact'])
  })
  it('should get pages, filtered by linkId', async () => {
    const { pages } = await query('{ pages(filter: { deleted: false }) { id name linkId } }')
    const linkIds = pages.map((p: any) => p.linkId)
    const resp = await query(`{ pages(filter: {linkIds: ["${linkIds[0]}", "${linkIds[1]}", "${linkIds[2]}", "${linkIds[3]}"] }) { id name linkId} }`)
    expect(resp.pages).to.have.lengthOf(4)
    const filteredLinkIds = resp.pages.map((p: any) => p.linkId)
    expect(filteredLinkIds).to.have.members([linkIds[0], linkIds[1], linkIds[2], linkIds[3]])
    expect(filteredLinkIds).to.not.have.members([linkIds[4], linkIds[5]])
  })
  it('should get pages, filtered by linkIdsReferenced', async () => {
    const { pages } = await query('{ pages(filter: { deleted: false }) { id name linkId } }')
    const contactPage = pages.find((p: any) => p.name === 'contact')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    const resp = await query(`{ pages(filter: { linkIdsReferenced: ["${contactPage.linkId}","${staffPage.linkId}"] }) { id name } }`)
    const resultPageNames = resp.pages.map((p: any) => p.name)
    expect(resultPageNames).to.have.members(['site1', 'location', 'people'])
  })
  it.skip('should get pages, filtered by "live" property', async () => {})
  it('should get pages, filtered by pagetreeId', async () => {
    const resp = await query('{ sites { name pagetrees { id name } } }')
    const site1 = resp.sites.find((s: any) => s.name === 'site1')
    const pagetree1 = site1.pagetrees.find((p: any) => p.name === 'pagetree1')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const pagetree3 = site3.pagetrees.find((p: any) => p.name === 'pagetree3')
    const { pages } = await query(`{ pages(filter: { pagetreeIds: [${pagetree1.id},${pagetree3.id}]}) { id name pagetree { id name } } }`)
    for (const page of pages) {
      expect([pagetree1.id, pagetree3.id]).to.include(page.pagetree.id)
    }
  })
  it.skip('should get pages, filtered by "published" property', async () => {})
  it.skip('should get pages, filtered by referencedByPageIds', async () => {})
  it('should get pages, filtered by site ID', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const resp = await query(`{ pages(filter: { siteIds: [${site1.id}] }) { id name } }`)
    const pageNames = resp.pages.map((p: any) => p.name)
    expect(pageNames).to.include.members(['location', 'people', 'contact', 'programs'])
    expect(pageNames).to.not.have.members(['sitemap', 'Site 3 Home'])
  })
  it('should get pages, filtered by path', async () => {
    const resp = await query('{ pages(filter: { paths: ["site1/about", "site1/programs/grad"] }) { id name } }')
    expect(resp.pages.find((p: any) => p.name === 'about')).to.not.be.undefined
    expect(resp.pages.find((p: any) => p.name === 'grad')).to.not.be.undefined
  })
  it('should get pages, filtered by path: page with same name and path in different pagetrees', async () => {
    const resp = await query('{ pages(filter: { paths: ["site3/about"] }) { id name } }')
    expect(resp.pages).to.have.lengthOf(2)
  })
  it.skip('should get pages using specific templates', async () => {})
  it.skip('should get pages, filtered by launched URL', async () => {})
  it('should get the ancestors for a page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name ancestors { id name } } }')
    const peoplePage = resp.pages.find((p: any) => p.name === 'people')
    const peoplePageAncestors = peoplePage.ancestors.map((a: any) => a.name)
    expect(peoplePageAncestors).to.have.members(['site1', 'about'])
    const gradPage = resp.pages.find((p: any) => p.name === 'grad')
    const gradPageAncestors = gradPage.ancestors.map((a: any) => a.name)
    expect(gradPageAncestors).to.have.members(['programs', 'site1'])
  })
  it('should return an empty array for the ancestors of a root page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name ancestors { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.ancestors).to.have.lengthOf(0)
  })
  it('should get a page\'s direct children', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name children { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    const rootPageChildren = rootPage.children.map((p: any) => p.name)
    expect(rootPageChildren).to.have.members(['about', 'programs', 'contact'])
  })
  it('should recursively get a page\'s descendents', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name children(recursive:true) { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    const rootPageDescendents = rootPage.children.map((p: any) => p.name)
    expect(rootPageDescendents).to.include.members(['about', 'people', 'staff'])
  })
  it('should return a page\'s creation datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name createdAt } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.createdAt).to.not.be.null
  })
  it('should return the user who created a page', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name createdBy { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.createdBy.id).to.equal('su01')
  })
  it.skip('should return the data for a page (no arguments)', async () => {})
  it.skip('should return the published version of data for a page', async () => {})
  it.skip('should return the data for a page, specifying schema version', async () => {})
  it.skip('should return the specified version of data for a page', async () => {})
  it('should return the deleted field for a page', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site1.id}] }) { id name deleted } }`)
    for (const page of pages) {
      expect([true, false]).to.include(page.deleted)
    }
  })
  it('should return a deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { name deletedAt } }')
    const eventsPage = resp.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedAt).to.not.be.null
  })
  it('should return null for a non-deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name deletedAt } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedAt).to.be.null
  })
  it('should return the user who deleted a deleted page', async () => {
    const resp = await query('{ pages(filter: {deleted: true}) { name deletedBy { id name } } }')
    const eventsPage = resp.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedBy.id).to.equal('su01')
  })
  it('should return null for deletedBy if the page is not deleted', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { name deletedBy { id name } } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedBy).to.be.null
  })
  it('should return a page\'s linkId', async () => {
    const resp = await query('{ pages(filter: {deleted: false}) { id name linkId } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.linkId).to.have.length.greaterThan(0)
  })
  it.skip('should return whether or not a page is live', async () => {})
  it('should return the last modified datetime for a page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name modifiedAt } }')
    const facultyPage = pages.find((p: any) => p.name === 'faculty')
    expect(facultyPage.modifiedAt).to.not.be.null
  })
  it('should return the user who last modified a page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name createdBy { id } modifiedBy { id } } }')
    const facultyPage = pages.find((p: any) => p.name === 'faculty')
    expect(facultyPage.createdBy.id).to.equal('su01')
    expect(facultyPage.modifiedBy.id).to.equal('ed02')
  })
  it('should return a page\'s parent page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name parent { id name } } }')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    expect(staffPage.parent.name).to.equal('people')
  })
  it('should return null for the parent page if the page is a root page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name parent { id name } } }')
    const site2Root = pages.find((p: any) => p.name === 'site2')
    expect(site2Root.parent).to.be.null
  })
  it('should return a page\'s root page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name rootpage { id name } } }')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    expect(staffPage.rootpage.name).to.equal('site1')
  })
  it('should get return the page itself, when its root page, if it is a root page', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name rootpage { id name } } }')
    const site2Root = pages.find((p: any) => p.name === 'site2')
    expect(site2Root.rootpage.name).to.equal('site2')
  })
  it('should get a page\'s path', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name path } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.path).to.equal('/site1/about/people')
  })
  it('should get a page\'s pagetree', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name pagetree { id name } } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.pagetree.name).to.equal('pagetree1')
  })
  it('should get a page\'s site', async () => {
    const { pages } = await query('{ pages(filter: {deleted: false}) { id name site { id name } } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.site.name).to.equal('site1')
  })
  it.skip('should get the templates approved for a page', async () => {})
  it.skip('should get the templates approved by a page, including those authorized for the current user', async () => {})
  it.skip('should return whether or not a page has a published version', async () => {})
  it.skip('should return the datetime a page was published', async () => {})
  it.skip('should return the user who most recently published a page', async () => {})
  it.skip('should return roles with any permissions on the page', async () => {})
  it.skip('should return roles with a specific permission on a page', async () => {})
  it.skip('should return a list of all versions of a page', async () => {})
})
