import { expect } from 'chai'
import { query } from '../common'

describe('sites', () => {
  it('should retrieve all sites', async () => {
    const resp = await query('{ sites { id, name } }')
    expect(resp.data.sites.length).to.equal(3)
  })
  it('should retrieve sites by id', async () => {
    const resp = await query('{ sites { id, name } }')
    const ids = resp.data.sites.map((s: any) => s.id)
    const resp2 = await query(`{ sites(filter: { ids: [${ids.join(',')}] }) { id, name } }`)
    expect(resp2.data.sites.length).to.equal(ids.length)
  })
  it.skip('should retrieve sites by launchUrl', async () => {})
  it.skip('should retrieve launched sites', async () => {})
  it('should retrieve site owners', async () => {
    const resp = await query('{ sites { id, name, owner { id name } } }')
    const site2 = resp.data.sites.find((s: any) => s.name === 'site2')
    expect(site2.owner.name).to.equal('Michael Scott')
  })
  it('should retrieve site managers', async () => {
    const resp = await query('{ sites { id, name, managers { id name } } }')
    const site3 = resp.data.sites.find((s: any) => s.name === 'site3')
    const managerNames = site3.managers.map((m: any) => m.name)
    expect(managerNames).to.include('Draco Malfoy')
  })
})
