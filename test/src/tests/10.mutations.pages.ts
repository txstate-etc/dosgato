/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('pages mutations', () => {
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
  it.skip('should not allow an unauthorized user to move a page', async () => {})
  it.skip('should create a page', async () => {})
  it.skip('should not allow an unauthorized user to create a page', async () => {})
  it.skip('should rename a page', async () => {})
  it.skip('should not allow an unauthorized user to rename a page', async () => {})
  it.skip('should delete a page', async () => {})
  it.skip('should not allow an unauthorized user to delete a page', async () => {})
  it.skip('should undelete a page', async () => {})
  it.skip('should not allow an unauthorized user to undelete a page', async () => {})
  it.skip('should publish a page', async () => {})
  it.skip('should not allow an unauthorized user to publish a page', async () => {})
  it.skip('should unpublish a page', async () => {})
  it.skip('should not allow an unauthorized user to unpublish a page', async () => {})
})
