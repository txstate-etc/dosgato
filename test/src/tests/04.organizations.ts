import { expect } from 'chai'
import { query } from '../common'

describe('organizations', () => {
  it('should retrieve all organizations', async () => {
    const resp = await query('{ organizations { id, name } }')
    const orgNames = resp.data.organizations.map((o: any) => o.name)
    expect(orgNames).to.include('The Office')
    expect(resp.data.organizations.length).to.equal(3)
  })
  it('should retrieve sites belonging to an organization', async () => {
    const resp = await query('{ organizations { id, name sites { id name } } }')
    const org = resp.data.organizations.find((o: any) => o.name === 'College of Arts and Crafts')
    expect(org.sites.length).to.be.greaterThan(0)
  })
})
