/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'
import { randomid } from 'txstate-utils'

describe('tags', () => {
  const oneId = randomid()
  const twoId = randomid()
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
          }]
        }
      }
    )
    expect(createDataEntry.success).to.be.true
    expect(createDataEntry.data.name).to.equal('autotest-tag-group')
    expect(createDataEntry.data.data.tags.length).to.equal(2)
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
  it('should replace tags on a page', async () => {
    const { replaceTagsOnPage } = await query<{ replaceTagsOnPage: { success: boolean, page: { id: string, userTags: { name: string }[] } } }>(`
      mutation tagPage ($tagId: ID!, $pageId: ID!) {
        replaceTagsOnPage (tagIds: [$tagId], pageId: $pageId) {
          success
          page {
            id
            userTags {
              name
            }
          }
        }
      }
    `, { tagId: twoId, pageId })
    expect(replaceTagsOnPage.success).to.be.true
    expect(replaceTagsOnPage.page.id).to.equal(pageId)
    expect(replaceTagsOnPage.page.userTags).to.deep.equal([{ name: 'Two' }])
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
})
