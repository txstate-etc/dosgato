/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('sites', () => {
  it('should retrieve all sites', async () => {
    const resp = await query('{ sites { id, name } }')
    expect(resp.sites).to.have.lengthOf(4)
  })
  it('should retrieve sites by id', async () => {
    const resp = await query('{ sites { id, name } }')
    const ids = resp.sites.map((s: any) => s.id)
    const resp2 = await query(`{ sites(filter: { ids: [${ids.join(',')}] }) { id, name } }`)
    expect(resp2.sites).to.have.lengthOf(ids.length)
  })
  it.skip('should retrieve sites by launchUrl', async () => {})
  it.skip('should retrieve launched sites', async () => {})
  it.skip('should retrieve sites by assetRootId', async () => {})
  it('should retrieve site owners', async () => {
    const resp = await query('{ sites { id, name, owner { id name } } }')
    const site2 = resp.sites.find((s: any) => s.name === 'site2')
    expect(site2.owner.name).to.equal('Michael Scott')
  })
  it('should retrieve site managers', async () => {
    const resp = await query('{ sites { id, name, managers { id name } } }')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const managerNames = site3.managers.map((m: any) => m.name)
    expect(managerNames).to.have.members(['Draco Malfoy', 'Luke Skywalker'])
  })
  it('should get pagetrees for sites', async () => {
    const resp = await query('{ sites { id name pagetrees { id name type } } }')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const pagetreeNames = site3.pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['pagetree3', 'pagetree3sandbox'])
  })
  it('should get filtered pagetrees for sites', async () => {
    const resp = await query('{ sites { id name pagetrees(filter: {types: [PRIMARY]}) { id name type } } }')
    const site3 = resp.sites.find((s: any) => s.name === 'site3')
    const pagetreeNames = site3.pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['pagetree3'])
    expect(pagetreeNames).to.not.have.members(['pagetree3sandbox'])
  })
  it('should get templates for sites', async () => {
    const resp = await query('{ sites { id name templates { key name } } }')
    const site2 = resp.sites.find((s: any) => s.name === 'site2')
    const templateNames = site2.templates.map((t: any) => t.key)
    expect(templateNames).to.have.members(['keyp1'])
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
    const { sites } = await query('{ sites { id name pageroot { id name } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    expect(site2.pageroot.name).to.equal('site2')
  })
  it('should get the datafolders for a site', async () => {
    const { sites } = await query(' { sites { id name datafolders { id name } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    const foldernames = site2.datafolders.map((f: any) => f.name)
    expect(foldernames).to.have.members(['site2datafolder', 'deletedfolder'])
  })
  it('should get the datafolders for a site, with a filter', async () => {
    const { sites } = await query(' { sites { id name datafolders(filter: { deleted: false }) { id name } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    const foldernames = site2.datafolders.map((f: any) => f.name)
    expect(foldernames).to.include('site2datafolder')
    expect(foldernames).to.not.include('deletedfolder')
  })
  it.skip('should get the organization responsible for a site', async () => {})
  it.skip('should get the root asset folder for a site', async () => {})
  it.skip('should get all the roles with any permissions on a site', async () => {})
  it.skip('should get the roles with a specific permission on a site', async () => {})
  it.skip('should return whether or not a site is launched', async () => {})
})
