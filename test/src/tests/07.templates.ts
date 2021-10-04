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
})
