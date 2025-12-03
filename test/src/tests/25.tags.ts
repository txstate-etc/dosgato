/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'
import { randomid } from 'txstate-utils'

describe('tags', () => {
  const oneId = randomid()
  const twoId = randomid()
  const blueId = randomid()
  const redId = randomid()
  let pageId: string
  it('should be able to create a new global tag group', async () => {
    const { createDataEntry } = await query<{ createDataEntry: { success: boolean, messages: any[], data: { id: string, name: string, data: { applicable: ('page' | 'asset' | 'data')[], tags: [{ id: string, name: string }] } } } }>('mutation createDataEntry ($data: JsonData!) { createDataEntry (args: { data: $data }) { success messages { message } data { id name data } } }',
      {
        data: {
          templateKey: 'dosgato-core-tags',
          savedAtVersion: '20240819140000',
          title: 'Autotest Tag Group',
          applicable: ['page'],
          internal: false,
          tags: [{
            id: oneId,
            name: 'One'
          }, {
            id: twoId,
            name: 'Two'
          }, {
            id: blueId,
            name: 'Blue'
          }, {
            id: redId,
            name: 'Red'
          }]
        }
      }
    )
    expect(createDataEntry.success).to.be.true
    expect(createDataEntry.data.name).to.equal('autotest-tag-group')
    expect(createDataEntry.data.data.tags.length).to.equal(4)
  })
  it('should be able to tag a page', async () => {
    const { pages } = await query('{ pages (filter: { published: true }) { id } }')
    pageId = pages[0].id
    const { addTagsToPages } = await query<{ addTagsToPages: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
      mutation tagPage ($tagId: ID!, $pageId: ID!) {
        addTagsToPages (tagIds: [$tagId], pageIds: [$pageId]) {
          success
          pages {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagId: oneId, pageId })
    expect(addTagsToPages.success).to.be.true
    expect(addTagsToPages.pages[0].id).to.equal(pageId)
    expect(addTagsToPages.pages[0].userTags).to.deep.equal([{ name: 'One' }])
  })
  it('should be able to find a page by tag', async () => {
    const { pages } = await query<{ pages: { id: string }[] }>('query findByTag ($tagId: ID!) { pages (filter: { userTagsAny: [$tagId] }) { id } }', { tagId: oneId })
    expect(pages.length).to.equal(1)
    expect(pages[0].id).to.equal(pageId)
  })
  it('should not include pages when they do not have all the tags in userTagsAll', async () => {
    const { pages } = await query<{ pages: { id: string }[] }>('query findByAllTags ($tagIds: [ID!]!) { pages (filter: { userTagsAll: $tagIds }) { id } }', { tagIds: [oneId, twoId] })
    expect(pages.length).to.equal(0)
  })
  it('should include pages that only have one of two tags in userTagsAny', async () => {
    const { pages } = await query<{ pages: { id: string }[] }>('query findByAnyTags ($tagIds: [ID!]!) { pages (filter: { userTagsAny: $tagIds }) { id } }', { tagIds: [oneId, twoId] })
    expect(pages.length).to.equal(1)
    expect(pages[0].id).to.equal(pageId)
  })
  it('should include pages when they match at least one tag in each set in userTags', async () => {
    await query(`
      mutation tagPage ($tagId: ID!, $pageId: ID!) {
        addTagsToPages (tagIds: [$tagId], pageIds: [$pageId]) {
          success
          pages {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagId: blueId, pageId })
    await Promise.all([
      (async () => {
        const { pages } = await query<{ pages: { id: string }[] }>('query findByTagSets ($userTags: [[ID!]!]!) { pages (filter: { userTags: $userTags }) { id } }', { userTags: [[oneId, twoId], [blueId, redId]] })
        expect(pages.length).to.equal(1)
        expect(pages[0].id).to.equal(pageId)
      })(),
      (async () => {
        const { pages } = await query<{ pages: { id: string }[] }>('query findByTagSets ($userTags: [[ID!]!]!) { pages (filter: { userTags: $userTags }) { id } }', { userTags: [[oneId, twoId], [blueId, redId]] })
        expect(pages.length).to.equal(1)
        expect(pages[0].id).to.equal(pageId)
      })(),
      (async () => {
        const { pages } = await query<{ pages: { id: string }[] }>('query findByTagSets ($userTags: [[ID!]!]!) { pages (filter: { userTags: $userTags }) { id } }', { userTags: [[oneId], [blueId, redId]] })
        expect(pages.length).to.equal(1)
        expect(pages[0].id).to.equal(pageId)
      })(),
      (async () => {
        const { pages } = await query<{ pages: { id: string }[] }>('query findByTagSets ($userTags: [[ID!]!]!) { pages (filter: { userTags: $userTags }) { id } }', { userTags: [[oneId, twoId], [blueId]] })
        expect(pages.length).to.equal(1)
        expect(pages[0].id).to.equal(pageId)
      })(),
      (async () => {
        const { pages } = await query<{ pages: { id: string }[] }>('query findByTagSets ($userTags: [[ID!]!]!) { pages (filter: { userTags: $userTags }) { id } }', { userTags: [[oneId], [blueId]] })
        expect(pages.length).to.equal(1)
        expect(pages[0].id).to.equal(pageId)
      })()
    ])
  })
  it('should replace tags on a page', async () => {
    const { replaceTagsOnPage } = await query<{ replaceTagsOnPage: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
      mutation tagPage ($tagId: ID!, $pageId: ID!) {
        replaceTagsOnPage (tagIds: [$tagId], pageIds: [$pageId]) {
          success
          pages {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagId: twoId, pageId })
    expect(replaceTagsOnPage.success).to.be.true
    expect(replaceTagsOnPage.pages[0].id).to.equal(pageId)
    expect(replaceTagsOnPage.pages[0].userTags).to.deep.equal([{ name: 'Two' }])
  })
  it('should replace all tags on a page with NO tags', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED] }) { id name } }')
    pageId = pages[0].id
    const { replaceTagsOnPage } = await query<{ replaceTagsOnPage: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
      mutation replaceTagsOnPage ($pageId: ID!, $tagIds: [ID!]!) {
        replaceTagsOnPage(pageIds: [$pageId], tagIds: $tagIds) {
        success
        pages {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagIds: [], pageId })
    expect(replaceTagsOnPage.success).to.be.true
    expect(replaceTagsOnPage.pages[0].id).to.equal(pageId)
    expect(replaceTagsOnPage.pages[0].userTags).to.deep.equal([])
  })
  it('should remove a tag from a page', async () => {
    const { removeTagsFromPages } = await query<{ removeTagsFromPages: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
      mutation untagPage ($tagId: ID!, $pageId: ID!) {
        removeTagsFromPages (tagIds: [$tagId], pageIds: [$pageId]) {
          success
          pages {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagId: twoId, pageId })
    expect(removeTagsFromPages.success).to.be.true
    expect(removeTagsFromPages.pages[0].id).to.equal(pageId)
    expect(removeTagsFromPages.pages[0].userTags).to.deep.equal([])
  })
  it('should tag multiple pages with multiple tags', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED] }) { id name } }')
    if (pages.length > 2) {
      const page1Id = pages[pages.length - 1].id
      const page2Id = pages[pages.length - 2].id
      const { replaceTagsOnPage } = await query<{ replaceTagsOnPage: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
        mutation replaceTagsOnPage ($pageIds: [ID!]!, $tagIds: [ID!]!) {
          replaceTagsOnPage(pageIds: $pageIds, tagIds: $tagIds) {
            success
            pages {
              id
              userTags {
                name
              }
            }
          }
        }
      `, { tagIds: [oneId, twoId], pageIds: [page1Id, page2Id] })
      expect(replaceTagsOnPage.success).to.be.true
      expect(replaceTagsOnPage.pages[0].id).to.be.oneOf([page1Id, page2Id])
      expect(replaceTagsOnPage.pages[0].userTags).to.deep.equal([{ name: 'One' }, { name: 'Two' }])
      expect(replaceTagsOnPage.pages[1].id).to.be.oneOf([page1Id, page2Id])
      expect(replaceTagsOnPage.pages[1].userTags).to.deep.equal([{ name: 'One' }, { name: 'Two' }])
    } else {
      console.warn('Not enough pages to test multiple tagging')
    }
  })
  it('should tag a page and all of its descendants', async () => {
    const { pages } = await query('{ pages(filter: { deleteStates: [NOTDELETED] }) { id name path pagetree { id } } }')
    const peoplePage = pages.find(p => p.name === 'people')
    if (peoplePage) {
      const peoplePageId = peoplePage.id
      const { replaceTagsOnPage } = await query<{ replaceTagsOnPage: { success: boolean, pages: { id: string, userTags: { name: string }[] }[] } }>(`
        mutation tagPage ($tagIds: [ID!]!, $pageId: ID!, $includeChildren: Boolean) {
          replaceTagsOnPage (tagIds: $tagIds, pageIds: [$pageId], includeChildren: $includeChildren) {
            success
            pages {
              id
              userTags {
                name
              }
            }
          }
        }
      `, { tagIds: [oneId, twoId], pageId: peoplePageId, includeChildren: true })
      expect(replaceTagsOnPage.success).to.be.true
      expect(replaceTagsOnPage.pages[0].userTags).to.deep.equal([{ name: 'One' }, { name: 'Two' }])
      const { pages: childPages } = await query(`{ pages(filter: { deleteStates: [NOTDELETED], pagetreeIds: [${peoplePage.pagetree.id}], parentPaths: ["${peoplePage.path}"]  }) { id name userTags { name } } }`)
      for (const childPage of childPages) {
        expect(childPage.userTags).to.deep.equal([{ name: 'One' }, { name: 'Two' }])
      }
    } else {
      console.warn('Could not find people page to test child page tagging')
    }
  })
  it('should be able to search for pages by tag when tag:tagname is in the search string', async () => {
    const { pages } = await query('{ pages(filter: { search: "tag:One" }) { id name userTags { name } } }')
    expect(pages).to.have.lengthOf.at.least(1)
    for (const page of pages) {
      expect(page.userTags).to.deep.include({ name: 'One' })
    }
  })
  it('should return no pages when searching for a tag that does not exist', async () => {
    const { pages } = await query<{ pages: { id: string, name: string, userTags: { name: string }[] }[] }>('query searchByNonExistentTag { pages (filter: { search: "tag:NonExistentTag" }) { id name userTags { name } } }')
    expect(pages).to.have.lengthOf(0)
  })
})
