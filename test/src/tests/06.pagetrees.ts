/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('pagetrees', () => {
  it('should retrieve a pagetree\'s owning site', async () => {
    const resp = await query('{ sites { id name pagetrees { id name site { id name } } } }')
    const site1 = resp.sites.find((s: any) => s.name === 'site1')
    expect(site1.pagetrees[0].site.name).to.equal('site1')
  })
  it('should retrieve a pagetree\'s creation time, name, and type', async () => {
    const resp = await query('{ sites { name pagetrees { name created type } } }')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    for (const ptree of site3.pagetrees) {
      expect(ptree).to.have.property('name')
      expect(ptree).to.have.property('created')
      expect(ptree).to.have.property('type')
      expect(ptree.created).to.not.be.null
      if (ptree.name === 'site3-sandbox') expect(ptree.type).to.equal('SANDBOX')
      if (ptree.name === 'site3') expect(ptree.type).to.equal('PRIMARY')
    }
  })
  it('should retrieve the pages in a pagetree', async () => {
    const resp = await query('{ sites { name pagetrees { name pages { id name } } } }')
    const site1 = resp.sites.find((s: any) => s.name === 'site1')
    const pagetree1 = site1.pagetrees.find((p: any) => p.name === 'site1')
    expect(pagetree1.pages).to.have.length.greaterThan(0)
  })
  it('should retrieve the root page of a pagetree', async () => {
    const { sites } = await query('{ sites { name pagetrees { name rootPage { name } } } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    expect(site1.pagetrees[0].rootPage.name).to.equal('site1')
  })
  it('should retrieve the date a pagetree was archived', async () => {
    const { sites } = await query('{ sites { name pagetrees(filter: { types: [ARCHIVE] }) { name archived } } }')
    const site4 = sites.find((s: any) => s.name === 'site4')
    for (const tree of site4.pagetrees) {
      expect(tree.archived).to.not.be.null
    }
  })
  it('should retrieve the date a pagetree was deleted', async () => {
    const { sites } = await query('{ sites { name pagetrees { name deleted } } }')
    const site4 = sites.find((s: any) => s.name === 'site4')
    for (const tree of site4.pagetrees) {
      if (tree.name === 'pagetree4deleted') {
        expect(tree.deleted).to.be.true
      } else {
        expect(tree.deleted).to.be.false
      }
    }
  })
  it('should retrieve all templates approved for use in a pagetree', async () => {
    const { sites } = await query('{ sites { name pagetrees { name templates { key } } } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const pagetree = site1.pagetrees.find(p => p.name === 'site1')
    expect(pagetree.templates).to.include.deep.members([{ key: 'keyp1' }, { key: 'keyp2' }, { key: 'keyp3' }])
  })
  it('should retrieve all templates approved for use in a pagetree, with a template filter applied', async () => {
    const { sites } = await query('{ sites { name pagetrees { name templates(filter: { names: ["pagetemplate1"]}) { key } } } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const pagetree = site1.pagetrees.find(p => p.name === 'site1')
    expect(pagetree.templates.length).to.equal(1)
    expect(pagetree.templates).to.include.deep.members([{ key: 'keyp1' }])
  })
  it('should retrieve roles with any permission on a pagetree', async () => {
    const { sites } = await query('{ sites { name pagetrees { name roles { name } } } }')
    const site5 = sites.find((s: any) => s.name === 'site5')
    const pagetree = site5.pagetrees[0]
    expect(pagetree.roles).to.have.deep.members([{ name: 'site5-siterulestest1' }, { name: 'site5-siterulestest2' }, { name: 'superuser' }])
    expect(pagetree.roles).to.not.have.deep.members([{ name: 'site5-siterulestest3' }])
  })
  // The siterule grants were updated to combine the old managePagetrees and promotePagetree grants into manageState, which covers all the
  // pagetree permissions. This test might not make sense anymore.
  it.skip('should retrieve roles with a specific permission on a pagetree', async () => {
    const { sites } = await query('{ sites { name pagetrees { name roles(withPermission:[PROMOTE]) { name } } } }')
    const site5 = sites.find((s: any) => s.name === 'site5')
    const pagetree = site5.pagetrees[0]
    expect(pagetree.roles).to.have.deep.members([{ name: 'site5-siterulestest2' }, { name: 'superuser' }])
    expect(pagetree.roles).to.not.have.deep.members([{ name: 'site5-siterulestest1' }])
  })
})
