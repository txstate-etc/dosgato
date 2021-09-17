import { expect } from 'chai'
import { query } from '../common'

describe('roles', () => {
  it.skip('should retrieve roles by id', async () => {
    // TODO: How can we test this if we don't know what the ids will be?
    const resp = await query('{ roles(filter: { ids: ["1", "2"] }) { id, name } }')
    expect(resp.data.roles.length).to.equal(2)
  })
  it('should retrieve roles by user', async () => {
    const resp = await query('{ roles(filter: { users: ["su03"] }) { id name } }')
    expect(resp.data.roles.length).to.equal(2)
    const roles = resp.data.roles.map((r: any) => r.name)
    expect(roles.includes('superuser')).to.equal(true)
  })
})
