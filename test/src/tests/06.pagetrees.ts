import { expect } from 'chai'
import { query } from '../common'

describe('pagetrees', () => {
  it('should retrieve a pagetree\'s owning site', async () => {
    const resp = await query('{ sites { id name pagetrees { id name site { id name } } } }')
    const site1 = resp.data.sites.find((s: any) => s.name === 'site1')
    expect(site1.pagetrees[0].site.name).to.equal('site1')
  })
})
