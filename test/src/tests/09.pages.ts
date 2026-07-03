import { expect } from 'chai'
import { query, queryAs } from '../common.js'

describe('pages', () => {
  it('should get pages, filtered by id', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED, MARKEDFORDELETE] }) { id name } }')
    const ids = pages.map((p: any) => p.id)
    const resp = await query(`{ pages(filter: {ids: ["${ids[0]}", "${ids[1]}", "${ids[2]}"] }) { id name} }`)
    expect(resp.pages).to.have.lengthOf(3)
    const pageIds = resp.pages.map((p: any) => p.id)
    expect(pageIds).to.have.members([ids[0], ids[1], ids[2]])
    expect(pageIds).to.not.have.members([ids[3], ids[4], ids[5]])
  })
  it('should get pages filtered by links', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["/site1/about", "/site3/sitemap"], pagetreeTypes: [PRIMARY] }) { id name path linkId site { id } } }')
    const aboutPage = pages.find((p: any) => p.path === '/site1/about')
    const sitemapPage = pages.find((p: any) => p.path === '/site3/sitemap')
    const resp = await query(`{ pages(filter: { links: [
      { linkId: "${aboutPage.linkId}", siteId: "${aboutPage.site.id}", path: "${aboutPage.path}" },
      { linkId: "${sitemapPage.linkId}", siteId: "${sitemapPage.site.id}", path: "${sitemapPage.path}" }
    ] }) { id name } }`)
    expect(resp.pages).to.have.lengthOf(2)
    expect(resp.pages.map((p: any) => p.id)).to.have.members([aboutPage.id, sitemapPage.id])
  })
  it('should get pages paginated', async () => {
    const resp1 = await query('{ pages(pagination: { page: 1, perPage: 2 }) { id name } pageInfo { pages { finalPage } } }')
    expect(resp1.pages).to.have.lengthOf(2)
    expect(resp1.pageInfo.pages.finalPage).to.be.greaterThan(1)
  })
  it('should filter and paginate at the same time', async () => {
    const resp = await query('{ pages(filter: { beneath: "/site3" }, pagination: { page: 1, perPage: 2 }) { id name path } }')
    expect(resp.pages).to.have.lengthOf(2)
    for (const p of resp.pages) {
      expect(p.path.startsWith('/site3')).to.be.true
    }
  })
  it('should get pages, filtered by pagetree type', async () => {
    const resp = await query('{ pages(filter: {pagetreeTypes: [SANDBOX]}) { id name pagetree { id type } } }')
    for (const page of resp.pages) {
      expect(page.pagetree.type).to.equal('SANDBOX')
    }
  })
  it('should get pages, filtered by assetReferenced', async () => {
    const { assets } = await query('{ assets(filter: { paths: ["/site1/bobcat"] }) { id name } }')
    const bobcat = assets[0]
    const { pages } = await query(`{ pages(filter: { assetReferenced: "${bobcat.id}" }) { id name } }`)
    expect(pages.map((p: any) => p.name)).to.include('pagewithasset')
    const { pages: directPages } = await query(`{ pages(filter: { assetReferenced: "${bobcat.id}", assetReferencedDirect: true }) { id name } }`)
    expect(directPages.map((p: any) => p.name)).to.include('pagewithasset')
    const { pages: indirectPages } = await query(`{ pages(filter: { assetReferenced: "${bobcat.id}", assetReferencedDirect: false }) { id name } }`)
    expect(indirectPages.map((p: any) => p.name)).to.not.include('pagewithasset')
  })
  it('should get deleted and orphaned pages', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED]}) { id name } }')
    const pageNames = resp.pages.map((p: any) => p.name)
    expect(pageNames).to.have.members(['events', 'site4-archive-1', 'deletedsite'])
  })
  it('should get undeleted pages', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name } }')
    const pageNames = resp.pages.map((p: any) => p.name)
    expect(pageNames).to.not.have.members(['events'])
    expect(pageNames).to.include.members(['about', 'site1', 'grad', 'contact'])
  })
  it('should get only undeleted pages and pages marked for deletion if no deleted filter is provided', async () => {
    const { sites } = await query('{ sites { name pagetrees(filter: { types: [PRIMARY] }) { pages { id deleted } } } }')
    const site1 = sites.find(s => s.name === 'site1')
    for (const page of site1.pagetrees[0].pages) {
      expect(page.deleteState).to.not.equal(2)
    }
  })
  it('should get pages, filtered by linkId', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED, MARKEDFORDELETE] }) { id name linkId } }')
    const linkIds = pages.map((p: any) => p.linkId)
    const resp = await query(`{ pages(filter: {linkIds: ["${linkIds[0]}", "${linkIds[1]}", "${linkIds[2]}", "${linkIds[3]}"] }) { id name linkId} }`)
    expect(resp.pages).to.have.lengthOf(4)
    const filteredLinkIds = resp.pages.map((p: any) => p.linkId)
    expect(filteredLinkIds).to.have.members([linkIds[0], linkIds[1], linkIds[2], linkIds[3]])
    expect(filteredLinkIds).to.not.have.members([linkIds[4], linkIds[5]])
  })
  it('should get pages, filtered by pageReferenced', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED, MARKEDFORDELETE], paths: ["/site1/about/people/staff"] }) { id name } }')
    const staffPage = pages[0]
    const resp = await query('query getPagesReferencingPage ($pageId: ID!) { pages(filter: { pageReferenced: $pageId }) { id name } }', { pageId: staffPage.id })
    const resultPageNames = resp.pages.map((p: any) => p.name)
    expect(resultPageNames).to.have.members(['people'])
  })
  it('should get pages, filtered by "live" property', async () => {
    // publish the root page of site1, which is launched, so that at least one page is live
    const { pages: rootPages } = await query('{ pages(filter: { paths: ["/site1"], pagetreeTypes: [PRIMARY] }) { id name live } }')
    const site1Root = rootPages[0]
    // not published yet, so the live field should be false even on a launched site
    expect(site1Root.live).to.be.false
    await query('mutation PublishPages ($pageIds: [ID!]!) { publishPages (pageIds: $pageIds) { success } }', { pageIds: [site1Root.id] })
    const { pages: livePages } = await query('{ pages(filter: { live: true }) { id live published pagetree { type } site { launchState } } }')
    const livePageIds = livePages.map((p: any) => p.id)
    expect(livePageIds).to.include(site1Root.id)
    for (const page of livePages) {
      expect(page.live).to.be.true
      expect(page.published).to.be.true
      expect(page.pagetree.type).to.equal('PRIMARY')
      expect(page.site.launchState).to.equal('LAUNCHED')
    }
    // published pages on sites that are not launched should not be live
    const { pages: publishedPages } = await query('{ pages(filter: { published: true }) { id live site { launchState } } }')
    const publishedNotLaunched = publishedPages.filter((p: any) => p.site.launchState !== 'LAUNCHED')
    expect(livePageIds).to.not.include.members(publishedNotLaunched.map((p: any) => p.id))
    for (const page of publishedNotLaunched) {
      expect(page.live).to.be.false
    }
    // the root page of a live site may not be unpublished, so take site1 off the air
    // before restoring the fixture state, and make sure its pages are no longer live
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    await query('mutation SetLaunchURL ($id: ID!, $host: String!, $path: String!, $enabled: LaunchState!) { setLaunchURL (siteId: $id, host: $host, path: $path, enabled: $enabled) { success } }', { id: site1.id, host: 'www.college.edu', path: '/site1/', enabled: 'PRELAUNCH' })
    const { pages: prelaunchPages } = await query('{ pages(filter: { live: true }) { id } }')
    expect(prelaunchPages.map((p: any) => p.id)).to.not.include(site1Root.id)
    // restore the page to its unpublished state and relaunch the site
    await query('mutation UnpublishPages ($pageIds: [ID!]!) { unpublishPages (pageIds: $pageIds) { success } }', { pageIds: [site1Root.id] })
    await query('mutation SetLaunchURL ($id: ID!, $host: String!, $path: String!, $enabled: LaunchState!) { setLaunchURL (siteId: $id, host: $host, path: $path, enabled: $enabled) { success } }', { id: site1.id, host: 'www.college.edu', path: '/site1/', enabled: 'LAUNCHED' })
    const { pages: afterPages } = await query('{ pages(filter: { live: true }) { id } }')
    expect(afterPages.map((p: any) => p.id)).to.not.include(site1Root.id)
  })
  it('should get pages, filtered by pagetreeId', async () => {
    const resp = await query('{ sites { name pagetrees { id name } } }')
    const site1 = resp.sites.find((s: any) => s.name === 'site1')
    const pagetree1 = site1.pagetrees.find((p: any) => p.name === 'site1')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const pagetree3 = site3.pagetrees.find((p: any) => p.name === 'site3')
    const { pages } = await query(`{ pages(filter: { pagetreeIds: [${pagetree1.id},${pagetree3.id}]}) { id name pagetree { id name } } }`)
    for (const page of pages) {
      expect([pagetree1.id, pagetree3.id]).to.include(page.pagetree.id)
    }
  })
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
    expect(resp.pages).to.have.lengthOf(1)
    const resp2 = await query('{ pages(filter: { paths: ["site3-sandbox/about"] }) { id name } }')
    expect(resp2.pages).to.have.lengthOf(1)
  })
  it('should get pages, filtered by ancestor path', async () => {
    const resp = await query('{ pages(filter: { beneath: ["/site3"] }) { id name path } }')
    expect(resp.pages.length).to.be.greaterThan(0)
    for (const p of resp.pages) expect(p.path.startsWith('/site3/')).to.be.true
    const resp2 = await query('{ pages(filter: { beneath: ["/site3-sandbox"] }) { id name path } }')
    expect(resp2.pages.length).to.be.greaterThan(0)
    for (const p of resp2.pages) expect(p.path.startsWith('/site3-sandbox/')).to.be.true
  })
  it('should get no pages when filtered by non-existing ancestor path', async () => {
    const resp = await query('{ pages(filter: { beneath: ["/nonsense"] }) { id name path } }')
    expect(resp.pages.length).to.equal(0)
    const resp2 = await query('{ pages(filter: { beneath: ["/site3/nonsense"] }) { id name path } }')
    expect(resp2.pages.length).to.equal(0)
  })
  it('should get pages by link when the linkId is valid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3/about"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "${page.linkId}", siteId: "${page.site.id}", path: "${page.path}", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get sandbox page by link when the linkId is valid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3-sandbox/about"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "${page.linkId}", siteId: "${page.site.id}", path: "/site3/about", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get pages by link when the linkId is invalid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3/about"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "NONSENSE", siteId: "${page.site.id}", path: "${page.path}", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get sandbox page by link when the linkId is invalid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3-sandbox/about"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "NONSENSE", siteId: "${page.site.id}", path: "/site3/about", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get root pages by link when the linkId is invalid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "NONSENSE", siteId: "${page.site.id}", path: "${page.path}", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get sandbox root page by link when the linkId is invalid', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3-sandbox"] }) { id path linkId site { id }, pagetree { id } } }')
    const page = pages[0]
    const resp = await query(`{ pages(filter: { links: { linkId: "NONSENSE", siteId: "${page.site.id}", path: "/site3", context: { pagetreeId: "${page.pagetree.id}" } } }) { id } }`)
    expect(resp.pages).to.have.lengthOf(1)
    expect(resp.pages[0].id).to.equal(page.id)
  })
  it('should get a page by path when the page name only exists in one pagetree in a site with multiple pagetrees', async () => {
    const { pages } = await query('{ pages(filter: { paths: ["site3/sitemap"] }) { id name } }')
    expect(pages.length).to.be.greaterThan(0)
  })
  it('should get pages using specific templates', async () => {
    // filter by a page template
    const { pages } = await query('{ pages(filter: { templateKeys: ["keyp3"] }) { id name template { key } } }')
    expect(pages.length).to.be.greaterThan(0)
    for (const page of pages) expect(page.template.key).to.equal('keyp3')
    // filter by a component template: matching pages use it in an area, so their own template differs
    const { pages: componentPages } = await query('{ pages(filter: { templateKeys: ["keyc3"] }) { id name template { key } } }')
    expect(componentPages.length).to.be.greaterThan(0)
    for (const page of componentPages) expect(page.template.key).to.not.equal('keyc3')
  })
  it('should get pages, filtered by launched URL', async () => {
    let { pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3/about"] }) { id name } }')
    expect(pages.length).to.be.greaterThan(0)
    ;({ pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3/about.html"] }) { id name } }'))
    expect(pages.length).to.be.greaterThan(0)
    ;({ pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3/about/"] }) { id name } }'))
    expect(pages.length).to.be.greaterThan(0)
    ;({ pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3"] }) { id name } }'))
    expect(pages.length).to.be.greaterThan(0)
    ;({ pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3.html"] }) { id name } }'))
    expect(pages.length).to.be.greaterThan(0)
    ;({ pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3/"] }) { id name } }'))
    expect(pages.length).to.be.greaterThan(0)
  })
  it('should get pages filtered by launched URL, forgiving about making the path safe', async () => {
    const { pages } = await query('{ pages(filter: { launchedUrls: ["https://www.example.com/site3/about_my-parrot.html"] }) { id name } }')
    expect(pages.length).to.equal(1)
  })
  it('should get the ancestors for a page', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name ancestors { id name } } }')
    const peoplePage = resp.pages.find((p: any) => p.name === 'people')
    const peoplePageAncestors = peoplePage.ancestors.map((a: any) => a.name)
    expect(peoplePageAncestors).to.have.members(['site1', 'about'])
    const gradPage = resp.pages.find((p: any) => p.name === 'grad')
    const gradPageAncestors = gradPage.ancestors.map((a: any) => a.name)
    expect(gradPageAncestors).to.have.members(['programs', 'site1'])
  })
  it('should return an empty array for the ancestors of a root page', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name ancestors { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.ancestors).to.have.lengthOf(0)
  })
  it('should get a page\'s direct children', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name children { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    const rootPageChildren = rootPage.children.map((p: any) => p.name)
    expect(rootPageChildren).to.have.members(['about', 'programs', 'contact', 'pagewithasset'])
  })
  it('should recursively get a page\'s descendents', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name children(recursive:true) { id name } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    const rootPageDescendents = rootPage.children.map((p: any) => p.name)
    expect(rootPageDescendents).to.include.members(['about', 'people', 'staff'])
  })
  it('should return a page\'s creation datetime', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name createdAt } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.createdAt).to.not.be.null
  })
  it('should return the user who created a page', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name createdBy { id firstname lastname } } }')
    const rootPage = resp.pages.find((p: any) => p.name === 'site1')
    expect(rootPage.createdBy.id).to.equal('su01')
  })
  it('should return the data for a page (no arguments)', async () => {
    const { pages } = await query(' { pages(filter: { deleteStates: [NOTDELETED, MARKEDFORDELETE] }) { name data } }')
    const facultyPage = pages.find(p => p.name === 'faculty')
    expect(facultyPage.data).to.have.property('templateKey')
    expect(facultyPage.data).to.have.property('savedAtVersion')
    expect(facultyPage.data).to.have.property('title')
    expect(facultyPage.data.title).to.equal('Faculty')
  })
  let versionTestPageId: string
  it('should return the published version of data for a page', async () => {
    // create a dedicated page and give it multiple versions so we don't disturb the
    // version history of any fixture pages that other tests rely on
    // site2's root page is published in the fixtures, which allows us to publish a child page
    const { sites } = await query('{ sites { id name rootPage { id } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    const { createPage } = await query(
      'mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) { createPage (name: $name, data: $data, targetId: $targetId) { success page { id } } }',
      { name: 'versiontestpage', targetId: site2.rootPage.id, data: { templateKey: 'keyp1', savedAtVersion: '20220710120000', title: 'Version Test v1' } })
    expect(createPage.success).to.be.true
    versionTestPageId = createPage.page.id
    // publish version 1, then save two more versions so the latest differs from the published version
    await query('mutation PublishPages ($pageIds: [ID!]!) { publishPages (pageIds: $pageIds) { success } }', { pageIds: [versionTestPageId] })
    const updatePageQuery = 'mutation UpdatePage ($pageId: ID!, $data: JsonData!, $dataVersion: Int!) { updatePage (pageId: $pageId, data: $data, dataVersion: $dataVersion) { success } }'
    const { updatePage: update1 } = await query(updatePageQuery, { pageId: versionTestPageId, dataVersion: 1, data: { templateKey: 'keyp1', savedAtVersion: '20220710120000', title: 'Version Test v2' } })
    expect(update1.success).to.be.true
    const { updatePage: update2 } = await query(updatePageQuery, { pageId: versionTestPageId, dataVersion: 2, data: { templateKey: 'keyp1', savedAtVersion: '20220710120000', title: 'Version Test v3' } })
    expect(update2.success).to.be.true
    const { pages } = await query(`{ pages(filter: { ids: ["${versionTestPageId}"] }) { id publishedData: data(published: true) latestData: data } }`)
    expect(pages[0].publishedData.title).to.equal('Version Test v1')
    expect(pages[0].latestData.title).to.equal('Version Test v3')
  })
  it('should return the data for a page, specifying schema version', async () => {
    const { pages } = await query(
      `query getPageDataAtSchemaVersion ($schemaversion: DateTime!) { pages(filter: { ids: ["${versionTestPageId}"] }) { id data(schemaversion: $schemaversion) } }`,
      { schemaversion: '2022-08-01T12:00:00Z' })
    // the data should be migrated to the requested schema version and stamped accordingly
    expect(pages[0].data.savedAtVersion).to.equal('20220801120000')
    expect(pages[0].data.title).to.equal('Version Test v3')
  })
  it('should return the specified version of data for a page', async () => {
    const { pages } = await query(`{ pages(filter: { ids: ["${versionTestPageId}"] }) { id v1: data(version: 1) v2: data(version: 2) latest: data } }`)
    expect(pages[0].v1.title).to.equal('Version Test v1')
    expect(pages[0].v2.title).to.equal('Version Test v2')
    expect(pages[0].latest.title).to.equal('Version Test v3')
  })
  it('should return the deleted field for a page', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site1.id}] }) { id name deleted } }`)
    for (const page of pages) {
      expect([true, false]).to.include(page.deleted)
    }
  })
  it('should return a deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED]}) { name deletedAt } }')
    const eventsPage = resp.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedAt).to.not.be.null
  })
  it('should return null for a non-deleted page\'s deletion datetime', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name deletedAt } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedAt).to.be.null
  })
  it('should return the user who deleted a deleted page', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED]}) { name deletedBy { id firstname lastname } } }')
    const eventsPage = resp.pages.find((p: any) => p.name === 'events')
    expect(eventsPage.deletedBy.id).to.equal('su01')
  })
  it('should return null for deletedBy if the page is not deleted', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name deletedBy { id firstname lastname } } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.deletedBy).to.be.null
  })
  it('should return a page\'s linkId', async () => {
    const resp = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name linkId } }')
    const staffPage = resp.pages.find((p: any) => p.name === 'staff')
    expect(staffPage.linkId).to.have.length.greaterThan(0)
  })
  it('should return the last modified datetime for a page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name modifiedAt } }')
    const facultyPage = pages.find((p: any) => p.name === 'faculty')
    expect(facultyPage.modifiedAt).to.not.be.null
  })
  it('should return the user who last modified a page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name createdBy { id } modifiedBy { id } } }')
    const facultyPage = pages.find((p: any) => p.name === 'faculty')
    expect(facultyPage.createdBy.id).to.equal('su01')
    expect(facultyPage.modifiedBy.id).to.equal('ed02')
  })
  it('should return a page\'s parent page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name parent { id name } } }')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    expect(staffPage.parent.name).to.equal('people')
  })
  it('should return null for the parent page if the page is a root page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name parent { id name } } }')
    const site2Root = pages.find((p: any) => p.name === 'site2')
    expect(site2Root.parent).to.be.null
  })
  it('should return a page\'s root page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name rootpage { id name } } }')
    const staffPage = pages.find((p: any) => p.name === 'staff')
    expect(staffPage.rootpage.name).to.equal('site1')
  })
  it('should get return the page itself, when its root page, if it is a root page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name rootpage { id name } } }')
    const site2Root = pages.find((p: any) => p.name === 'site2')
    expect(site2Root.rootpage.name).to.equal('site2')
  })
  it('should get a page\'s path', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name path } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.path).to.equal('/site1/about/people')
  })
  it('should get a page\'s pagetree', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name pagetree { id name } } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.pagetree.name).to.equal('site1')
  })
  it('should get a page\'s site', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name site { id name } } }')
    const peoplePage = pages.find((p: any) => p.name === 'people')
    expect(peoplePage.site.name).to.equal('site1')
  })
  it('should get the templates approved for a page', async () => {
    const { pages } = await queryAs('ed02', '{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name templates { key } } }')
    const site1RootPage = pages.find((p: any) => p.name === 'site1')
    expect(site1RootPage.templates).to.deep.include.members([{ key: 'keyp1' }, { key: 'keyp2' }, { key: 'keyp3' }])
  })
  it('should get the templates approved by a page, including those authorized for the current user', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [ALL]}) { id name templates { key } } }')
    const site5RootPage = pages.find((p: any) => p.name === 'site5')
    // su01 can use all templates on all pages
    expect(site5RootPage.templates).to.deep.include.members([{ key: 'keyp1' }, { key: 'keyp2' }, { key: 'keyp3' }, { key: 'keyc1' }, { key: 'keyc2' }, { key: 'keyc3' }])
  })
  it('should return whether or not a page has a published version', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name published } }')
    expect(pages).to.deep.include({ name: 'site2', published: true })
    expect(pages).to.deep.include({ name: 'programs', published: false })
  })
  it('should return the datetime a page was published', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name publishedAt } }')
    const site2RootPage = pages.find((p: any) => p.name === 'site2')
    expect(site2RootPage.publishedAt).to.not.be.null
  })
  it('should return the user who most recently published a page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { name publishedBy { id } } }')
    const site2RootPage = pages.find((p: any) => p.name === 'site2')
    expect(site2RootPage.publishedBy.id).to.equal('su01')
  })
  it('should return roles with any permissions on the page', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site7 = sites.find((s: any) => s.name === 'site7')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site7.id}] }) { name roles { id name } } }`)
    const roleNames = pages[0].roles.map((r: any) => r.name)
    expect(roleNames).to.include.members(['pagerolestest1', 'pagerolestest2'])
  })
  it('should return roles with a specific permission on a page', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site7 = sites.find((s: any) => s.name === 'site7')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site7.id}] }) { name roles(withPermission: PUBLISH) { id name } } }`)
    const roleNames = pages[0].roles.map((r: any) => r.name)
    expect(roleNames).to.include('pagerolestest1')
    expect(roleNames).to.not.include('pagerolestest2')
  })
  it('should return a list of all versions of a page', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [NOTDELETED, MARKEDFORDELETE]}) { id name versions { version data } } }')
    const facultyPage = pages.find((p: any) => p.name === 'faculty')
    expect(facultyPage.versions).to.have.lengthOf(2)
    for (const version of facultyPage.versions) {
      if (version.version === 1) {
        expect(version.data.title).to.equal('Faculty')
        expect(version.data).to.not.have.property('hideNav')
      }
      if (version.version === 2) {
        expect(version.data.hideNav).to.be.true
      }
    }
  })
  it('should only return pages the current user is allowed to edit', async () => {
    const { pages } = await queryAs('ed17', '{ pages(filter: { viewForEdit: true }) { id name } }')
    const pageNames = pages.map((p: any) => p.name)
    expect(pageNames).to.have.lengthOf(1)
    expect(pageNames[0]).to.equal('site7')
  })
  it('should consider undeleted pages in a deleted pagetree deleted', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED] }) {id name deleted pagetree { id name deleted } } }')
    const pageInDeletedPagetree = pages.find(p => p.name === 'site4-archive-1')
    expect(pageInDeletedPagetree).to.not.be.undefined
    expect(pageInDeletedPagetree.deleted).to.be.false
    expect(pageInDeletedPagetree.pagetree.deleted).to.be.true
  })
  it('should consider undeleted pages in a deleted site deleted', async () => {
    const { pages } = await query('{ pages(filter: {deleteStates: [DELETED, ORPHAN_NOTDELETED, ORPHAN_MARKEDFORDELETE, ORPHAN_DELETED] }) {id name deleted site { id name deleted } } }')
    const pageInDeletedSite = pages.find(p => p.name === 'deletedsite')
    expect(pageInDeletedSite).to.not.be.undefined
    expect(pageInDeletedSite.deleted).to.be.false
    expect(pageInDeletedSite.site.deleted).to.be.true
  })
  it('should search pages', async () => {
    const { pages } = await query('{ pages(filter: { search: "about" }) { id name title } }')
    expect(pages.map(p => p.name)).to.include('about-my-parrot')
    expect(pages.map(p => p.title)).to.include('About Site 3')
  })
  it('should search pages by phrase', async () => {
    const { pages } = await query('{ pages(filter: { phraseSearch: [{ query: "Programs" }] }) { id name title } }')
    expect(pages.length).to.be.greaterThanOrEqual(1)
    const titles = pages.map((p: any) => p.title)
    expect(titles).to.include('Programs')
  })
  it('should support substring mode in phrase search', async () => {
    const { pages: withSubstring } = await query('{ pages(filter: { phraseSearch: [{ query: "rogram", substring: true }] }) { id name title } }')
    expect(withSubstring.map((p: any) => p.title)).to.include('Programs')
    const { pages: withoutSubstring } = await query('{ pages(filter: { phraseSearch: [{ query: "rogram" }] }) { id name title } }')
    expect(withoutSubstring.map((p: any) => p.title)).to.not.include('Programs')
  })
})
