/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('organization mutations', () => {
  it('should be able to create an organization', async () => {
    const { createOrganization } = await query('mutation createOrganization ($name: String!) { createOrganization (name: $name) { success organization { id name } } }', { name: 'Autotest Org' })
    expect(createOrganization.success).to.be.true
    expect(createOrganization.organization.name).to.equal('Autotest Org')
    const { organizations } = await query('query getOrgById ($id: ID!) { organizations (filter:{ids:[$id]}) { id name } }', { id: createOrganization.organization.id })
    expect(organizations.length).to.be.greaterThan(0)
    expect(organizations[0].name).to.equal(createOrganization.organization.name)
  })
})
