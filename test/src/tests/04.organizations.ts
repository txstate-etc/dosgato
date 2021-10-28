/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('organizations', () => {
  it('should retrieve all organizations', async () => {
    const resp = await query('{ organizations { id, name } }')
    const orgNames = resp.data.organizations.map((o: any) => o.name)
    expect(orgNames).to.have.members(['The Office', 'College of Arts and Crafts', 'Department of Mathematics'])
    expect(resp.data.organizations).to.have.lengthOf(3)
  })
  it('should retrieve sites belonging to an organization', async () => {
    const resp = await query('{ organizations { id, name sites { id name } } }')
    const org = resp.data.organizations.find((o: any) => o.name === 'College of Arts and Crafts')
    expect(org.sites).to.have.length.greaterThan(0)
  })
})
