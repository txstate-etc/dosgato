import { expect } from 'chai'
import { queryAs } from '../common.js'

async function queryAsAnonymous <T = any> (query: string, variables?: any) {
  return queryAs<T>('anonymous', query, variables)
}

// in progress and skipped for now
describe.skip('anonymous access', () => {
  before(async function () {
      this.timeout(10000)
      let success = false
      while (!success) {
        try {
          // it should get some pages. if not, the API is not ready
          await queryAsAnonymous('{ pages { id } }')
          success = true
        } catch (e: any) {
          // keep trying
        }
      }
    })
  it('should return only published pages', async () => {
    const { pages } = await queryAsAnonymous('{ pages { id, title, live } }')
    console.log(pages)
    expect(pages.length).to.be.greaterThan(0)
    expect(pages.every(page => page.live)).to.be.true
  })
})
