/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('templates', () => {
  it('should retrieve all templates', async () => {
    const resp = await query('{ templates { key name } }')
    expect(resp.templates.length).to.be.greaterThan(0)
    expect(new Set(resp.templates.map((t: any) => t.key)).size).to.equal(resp.templates.length)
  })
  it('should retrieve templates by keys', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp1", "keyc1", "keyd1"] }) { key name } }')
    expect(resp.templates.length).to.equal(3)
    const keys = resp.templates.map((t: any) => t.key)
    expect(keys).to.have.members(['keyp1', 'keyc1', 'keyd1'])
  })
  it('should retrieve templates by name', async () => {
    const resp = await query('{ templates(filter: { names: ["pagetemplate1", "Colors"] }) { key name } }')
    expect(resp.templates).to.have.lengthOf(2)
    const names = resp.templates.map((t: any) => t.name)
    expect(names).to.have.members(['pagetemplate1', 'Colors'])
  })
  it('should retrieve templates by type', async () => {
    const resp = await query('{ templates(filter: { types: [COMPONENT] }) { key name } }')
    expect(resp.templates).to.have.lengthOf(5)
    const keys = resp.templates.map((t: any) => t.key)
    expect(keys).to.include.members(['keyc1', 'keyc2', 'keyc3', 'richtext', 'horizontalrule'])
  })
  it('should retrieve pagetrees authorized directly for a template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees(direct: true) { id name } } }')
    const pagetreeNames = resp.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['site3-sandbox'])
  })
  it('should retrieve pagetrees authorized for a template through a site', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees(direct: false) { id name } } }')
    const pagetreeNames = resp.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['site1', 'site2'])
  })
  it('should retrieve pagetrees authorized for a template directly or through a site', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees { id name } } }')
    const pagetreeNames = resp.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.have.members(['site3-sandbox', 'site1', 'site2'])
  })
  it('should retrieve sites where the whole site is able to use this template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name sites { name } } }')
    const template2data = resp.templates.find((t: any) => t.key === 'keyp2')
    const siteNames = template2data.sites.map((s: any) => s.name)
    expect(siteNames).to.have.members(['site1', 'site2'])
  })
  it('should retrieve site where the whole site can use a template and sites where one or more pagetrees are able to use the template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name sites(atLeastOneTree: true) { name } } }')
    const template2data = resp.templates.find((t: any) => t.key === 'keyp2')
    const siteNames = template2data.sites.map((s: any) => s.name)
    expect(siteNames).to.have.members(['site1', 'site2', 'site3'])
  })
  it('should retrieve pages using a given template', async () => {
    const { templates } = await query('{ templates(filter: { keys: ["keyp1"] }) { key name pages { name } } }')
    const template1data = templates.find((t: any) => t.key === 'keyp1')
    expect(template1data.pages.map((p: any) => p.name)).to.include.members(['site1', 'site4', 'about', 'programs', 'contact', 'location'])
  })
  it('should return an empty array if we try to retrieve pages using a data template', async () => {
    const { templates } = await query('{ templates(filter: { keys: ["keyd1"] }) { key name pages { name } } }')
    expect(templates[0].pages).to.have.lengthOf(0)
  })
  it('should retrieve data entries using a given template', async () => {
    const { templates } = await query('{ templates(filter: { keys: ["keyd1"] }) { key name data(filter: { deleted: SHOW }) { name } } }')
    const template1data = templates.find((t: any) => t.key === 'keyd1')
    expect(template1data.data.map((d: any) => d.name)).to.include.members(['Red Content', 'Blue Content', 'Orange Content'])
  })
  it('should return an empty array if we try to retrieve data using a page or component template', async () => {
    const { templates } = await query('{ templates(filter: { keys: ["keyp1", "keyc1"] }) { key name data { name } } }')
    for (const template of templates) {
      expect(template.data).to.have.lengthOf(0)
    }
  })
})
