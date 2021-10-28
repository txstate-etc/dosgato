/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('pagetrees', () => {
  it('should retrieve a pagetree\'s owning site', async () => {
    const resp = await query('{ sites { id name pagetrees { id name site { id name } } } }')
    const site1 = resp.data.sites.find((s: any) => s.name === 'site1')
    expect(site1.pagetrees[0].site.name).to.equal('site1')
  })
  it('should retrieve a pagetree\'s creation time, name, and type', async () => {
    const resp = await query('{ sites { name pagetrees { name created type } } }')
    const site3 = resp.data.sites.find((s: any) => s.name === 'site3')
    for (const ptree of site3.pagetrees) {
      expect(ptree).to.have.property('name')
      expect(ptree).to.have.property('created')
      expect(ptree).to.have.property('type')
      expect(ptree.created).to.not.be.null
      if (ptree.name === 'pagetree3') expect(ptree.type).to.equal('SANDBOX')
      if (ptree.name === 'pagetree3primary') expect(ptree.type).to.equal('PRIMARY')
    }
  })
  it('should retrieve the pages in a pagetree', async () => {
    const resp = await query('{ sites { name pagetrees { name pages { id name } } } }')
    const site1 = resp.data.sites.find((s: any) => s.name === 'site1')
    const pagetree1 = site1.pagetrees.find((p: any) => p.name === 'pagetree1')
    expect(pagetree1.pages).to.have.length.greaterThan(0)
  })
  it.skip('should retrieve the root page of a pagetree', async () => {})
  it.skip('should retrieve the date a pagetree was archived', async () => {})
  it.skip('should retrieve the date a pagetree was deleted', async () => {})
  it.skip('should retrieve all templates approved for use in a pagetree', async () => {})
  it.skip('should retrieve all templates approved for use in a pagetree, with a template filter applied', async () => {})
})
