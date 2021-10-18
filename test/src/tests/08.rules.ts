import { expect } from 'chai'
import { query } from '../common'

describe('global rules', () => {
  it('should get global rules for a role', async () => {
    const resp = await query('{ roles(filter: { users: ["su01"] }) { name globalRules { grants { manageUsers } } } }')
    const superUserRole = resp.data.roles.find((r: any) => r.name === 'superuser')
    const globalRules = superUserRole.globalRules
    expect(globalRules.length).to.equal(1)
    expect(globalRules[0].grants.manageUsers).to.equal(true)
  })
  it('should get the role attached to a global rule', async () => {
    const resp = await query('{ roles(filter: { users: ["su01"] }) { name globalRules { role { id name } } } }')
    const superUserRole = resp.data.roles.find((r: any) => r.name === 'superuser')
    const globalRules = superUserRole.globalRules
    expect(globalRules[0].role.name).to.equal('superuser')
  })
})

describe('site rules', () => {
  it.skip('should get the site rules for a role', async () => {})
  it.skip('should filter site rules by role ID', async () => {})
  it.skip('should filter site rules by site ID', async () => {})
  it.skip('should return site rules that grant the "launch" permission', async () => {})
  it.skip('should return site rules that grant the "rename" permission', async () => {})
  it.skip('should return site rules that grant the "manageOwners" permission', async () => {})
  it.skip('should return site rules that grant the "managePagetrees" permission', async () => {})
  it.skip('should return site rules that grant the "promotePagetrees" permission', async () => {})
  it.skip('should return site rules that grant the "delete" permission', async () => {})
  it.skip('should return site rules that grant the "undelete" permission', async () => {})
  it.skip('should get the role attached to a site rule', async () => {})
  it.skip('should get the site targeted by a site rule', async () => {})
  it.skip('should return null for the site of a site rule that targets all sites', async () => {})
})

describe('asset rules', () => {
  it.skip('should get the asset rules for a role', async () => {})
  it.skip('should filter asset rules by site ID', async () => {})
  it.skip('should filter asset rules by null site ID', async () => {})
  it.skip('should filter asset rules by role ID', async () => {})
  it.skip('should filter asset rules by path', async () => {})
  it.skip('should return asset rules that grant the "create" permission', async () => {})
  it.skip('should return asset rules that grant the "update" permission', async () => {})
  it.skip('should return asset rules that grant the "move" permission', async () => {})
  it.skip('should return asset rules that grant the "delete" permission', async () => {})
  it.skip('should return asset rules that grant the "undelete" permission', async () => {})
  it.skip('should get the role attached to an asset rule', async () => {})
  it.skip('should get the site targeted by an asset rule', async () => {})
  it.skip('should return null for the site of an asset rule that targets all sites', async () => {})
})

describe('page rules', () => {
  it.skip('should get the page rules for a role', async () => {})
  it.skip('should get the role attached to a page rule', async () => {})
  it.skip('should get the site targeted by a page rule', async () => {})
  it.skip('should return null for the site of a page rule that targets all sites', async () => {})
  it.skip('should get the pagetree targeted by a page rule', async () => {})
  it.skip('should return null for the pagetree of a page rule that targets all pagetrees', async () => {})
})

describe('data rules', () => {
  it.skip('should get the data rules for a role', async () => {})
  it.skip('should get the role attached to a data rule', async () => {})
  it.skip('should get the site targeted by a data rule', async () => {})
  it.skip('should return null for the site of a data rule that targets all sites', async () => {})
  it.skip('should get the data template for which a data rule applies', async () => {})
  it.skip('should return null for the data template of a data rule that targets all data templates', async () => {})
})

describe('template rules', () => {
  it.skip('should get the template rules for a role', async () => {})
  it.skip('should filter template rules by role ID', async () => {})
  it.skip('should filter template rules by template key', async () => {})
  it.skip('should filter template rules by null template key', async () => {})
  it.skip('should filter template rules on whether they grant the "use" permission', async () => {})
  it.skip('should get the role attached to a template rule', async () => {})
  it.skip('should get the template targeted by a template rule', async () => {})
  it.skip('should return null for the template of a template rule that targets all templates', async () => {})
})
