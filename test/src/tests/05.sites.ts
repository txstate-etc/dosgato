/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'
import { keyby } from 'txstate-utils'

describe('sites', () => {
  let sitehash: any
  let sites: any
  before(async () => {
    const resp = await query(`
    {
      sites {
        id
        name
        owner { id firstname lastname }
        managers { id firstname lastname }
        pagetrees { id name type }
        templates { key name }
        rootPage { id name }
        dataroots { template { key } }
        organization { id name }
        rootAssetFolder { id name }
        launched
        roles { id name }
        comments { id comment }
      }
    }`)
    sites = resp.sites
    sitehash = keyby(sites, 'name')
  })
  it('should retrieve all sites', async () => {
    expect(sites).to.have.length.greaterThan(0)
  })
  it('should retrieve sites by id', async () => {
    const ids = sites.map((s: any) => s.id)
    const resp2 = await query(`{ sites(filter: { ids: [${ids.join(',')}] }) { id, name } }`)
    expect(resp2.sites).to.have.lengthOf(ids.length)
  })
  it('should retrieve sites by launchUrl', async () => {
    const { sites } = await query('{ sites(filter: {launchUrls: ["http://www.example.com/site3/"]}) { id name url { host path } } }')
    for (const site of sites) {
      expect(site.url.host).to.equal('www.example.com')
      expect(site.url.path.indexOf('/site3/')).to.be.greaterThan(-1)
    }
  })
  it('should retrieve launched sites', async () => {
    const { sites } = await query('{ sites(filter: {launched: true}) { id name launched } }')
    for (const site of sites) {
      expect(site.launched).to.be.true
    }
  })
  it('should retrieve site owners', async () => {
    expect(sitehash.site2.owner.firstname).to.equal('Michael')
    expect(sitehash.site2.owner.lastname).to.equal('Scott')
  })
  it('should retrieve site managers', async () => {
    const managerNames = sitehash.site3.managers.map((m: any) => m.lastname)
    expect(managerNames).to.have.members(['Malfoy', 'Skywalker'])
  })
  it('should get pagetrees for sites', async () => {
    const pagetreeNames = sitehash.site3.pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['site3', 'site3-sandbox'])
  })
  it('should get filtered pagetrees for sites', async () => {
    const resp = await query('{ sites { id name pagetrees(filter: {types: [PRIMARY]}) { id name type } } }')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const pagetreeNames = site3.pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['site3'])
    expect(pagetreeNames).to.not.have.members(['site3-sandbox'])
  })
  it('should get templates for sites', async () => {
    const templateNames = sitehash.site2.templates.map((t: any) => t.key)
    expect(templateNames).to.have.members(['keyp1', 'keyp2'])
  })
  it('should get filtered templates for sites', async () => {
    const resp = await query('{ sites { id name templates(filter: { keys: ["keyp3"] }) { key name } } }')
    const site2 = resp.sites.find((s: any) => s.name === 'site2')
    expect(site2.templates).to.have.lengthOf(0)
    const site1 = resp.sites.find((s: any) => s.name === 'site1')
    const templateNames = site1.templates.map((t: any) => t.key)
    expect(templateNames).to.have.members(['keyp3'])
  })
  it('should get the root page for a site', async () => {
    expect(sitehash.site2.rootPage.name).to.equal('site2')
  })
  it('should get the data roots for a site', async () => {
    expect(sitehash.site2.dataroots.length).to.be.greaterThan(0)
  })
  it('should get data root for a specific template on a site', async () => {
    const { sites } = await query(' { sites { id name dataroots(filter: { templateKeys: ["articledatakey"] }) { template { key } } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    expect(site2.dataroots.length).to.equal(1, JSON.stringify(site2.dataroots, undefined, 2))
    expect(site2.dataroots[0].template.key).to.equal('articledatakey')
  })
  it('should get the organization responsible for a site', async () => {
    expect(sitehash.site2.organization.name).to.equal('Department of Mathematics')
  })
  it('should get the root asset folder for a site', async () => {
    expect(sitehash.site3.rootAssetFolder).to.not.be.null
    expect(sitehash.site3.rootAssetFolder.name).to.equal('site3')
  })
  it('should get all the roles with any permissions on a site', async () => {
    const roleNames6 = sitehash.site6.roles.map((r: any) => r.name)
    expect(roleNames6).to.include.members(['siterolestest1', 'siterolestest2'])
    const roleNames1 = sitehash.site1.roles.map((r: any) => r.name)
    expect(roleNames1).to.not.include.members(['siterolestest1', 'siterolestest2'])
  })
  it('should get the roles with a specific permission on a site', async () => {
    const resp = await query(`
    {
      sites(filter: { ids: [${sitehash.site6.id}] }) {
        id
        name
        roles(withAssetPermission: [DELETE], withPagePermission: [DELETE], withSitePermission: [DELETE], withDataPermission: [DELETE]) {
          name
        }
      }
    }`)
    expect(resp.sites[0].roles).to.deep.include({ name: 'siterolestest1' })
    expect(resp.sites[0].roles).to.not.deep.include({ name: 'siterolestest2' })
  })
  it('should return whether or not a site is launched', async () => {
    expect(sitehash.site1.launched).to.be.true
    expect(sitehash.site2.launched).to.be.false
  })
  it('should return comments for sites', async () => {
    expect(sitehash.site3.comments).to.have.lengthOf(2)
    expect(sitehash.site3.comments.map(c => c.comment)).to.include.members(['Added owner su03', 'Added managers ed01 and ed03'])
  })
})
