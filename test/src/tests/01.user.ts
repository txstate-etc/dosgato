import { expect } from 'chai'
import { query } from '../common'

describe('users', () => {
  it.skip('should return the logged in user', async () => {
    const resp = await query('{ users(filter: { ids: ["self"] }) { id, name, email } }')
    expect(resp.data.users.length).to.equal(1)
    // TODO: make sure it is the correct user
  })
  it('should retrieve users by netid', async () => {
    const resp = await query('{ users(filter: { ids: ["su01", "ed01"] }) { id, name, email } }')
    expect(resp.data.users.length).to.equal(2)
  })
  it('should retrieve users who are diabled in the system', async () => {
    const resp = await query('{ users(filter: { enabled: false }) { id, name, email } }')
    const found = resp.data.users.some((user: any) => {
      return user.id === 'ed02'
    })
    expect(found).to.equal(true)
  })
  it('should retrieve users who are enabled in the system', async () => {
    const resp = await query('{ users(filter: { enabled: true }) { id, name, email } }')
    expect(resp.data.users.length).to.be.greaterThan(0)
    const found = resp.data.users.some((user: any) => {
      return user.id === 'ed02'
    })
    expect(found).to.equal(false)
  })
})
