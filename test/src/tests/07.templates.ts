import { expect } from 'chai'
import { query } from '../common'

describe('templates', () => {
  it('should retrieve all templates', async () => {
    const resp = await query('{ templates { key name } }')
    expect(resp.data.templates.length).to.equal(9)
  })
  it('should retrieve templates by keys', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp1", "keyc1", "keyd1"] }) { key name } }')
    expect(resp.data.templates.length).to.equal(3)
    const keys = resp.data.templates.map((t: any) => t.key)
    expect(keys).to.include('keyp1')
    expect(keys).to.include('keyc1')
    expect(keys).to.include('keyd1')
  })
  it('should retrieve templates by name', async () => {
    const resp = await query('{ templates(filter: { names: ["pagetemplate1", "datatemplate1"] }) { key name } }')
    expect(resp.data.templates.length).to.equal(2)
    const names = resp.data.templates.map((t: any) => t.name)
    expect(names).to.include('pagetemplate1')
    expect(names).to.include('datatemplate1')
  })
  it('should retrieve templates by type', async () => {
    const resp = await query('{ templates(filter: { types: [COMPONENT] }) { key name } }')
    expect(resp.data.templates.length).to.equal(3)
    const keys = resp.data.templates.map((t: any) => t.key)
    expect(keys).to.include('keyc1')
    expect(keys).to.include('keyc2')
    expect(keys).to.include('keyc3')
  })
  it('should retrieve pagetrees authorized directly for a template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees(direct: true) { id name } } }')
    const pagetreeNames = resp.data.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.include('pagetree2')
  })
  it('should retrieve pagetrees authorized for a template through a site', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees(direct: false) { id name } } }')
    const pagetreeNames = resp.data.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.include('pagetree1')
  })
  it('should retrieve pagetrees authorized for a template directly or through a site', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name pagetrees { id name } } }')
    const pagetreeNames = resp.data.templates[0].pagetrees.map((p: any) => p.name)
    expect(pagetreeNames).to.include('pagetree3')
    expect(pagetreeNames).to.include('pagetree1')
  })
  it('should retrieve sites where the whole site is able to use this template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name sites { name } } }')
    const template2data = resp.data.templates.find((t: any) => t.key === 'keyp2')
    const siteNames = template2data.sites.map((s: any) => s.name)
    expect(siteNames).to.include('site1')
    expect(siteNames).to.not.include('site2')
  })
  it('should retrieve site where the whole site can use a template and sites where one or more pagetrees are able to use the template', async () => {
    const resp = await query('{ templates(filter: { keys: ["keyp2"] }) { key name sites(atLeastOneTree: true) { name } } }')
    const template2data = resp.data.templates.find((t: any) => t.key === 'keyp2')
    const siteNames = template2data.sites.map((s: any) => s.name)
    expect(siteNames).to.include('site1')
    expect(siteNames).to.include('site2')
    expect(siteNames).to.include('site3')
  })
})