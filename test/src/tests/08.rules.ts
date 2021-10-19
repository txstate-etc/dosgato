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
  it('should get the site rules for a role', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { grants { delete launch manageOwners managePagetrees promotePagetree rename undelete } } } }')
    const testrole1 = resp.data.roles.find((r: any) => r.name === 'site1-siterulestest1')
    const siteRules = testrole1.siteRules[0]
    expect(siteRules.grants.delete).to.equal(false)
    expect(siteRules.grants.launch).to.equal(true)
    expect(siteRules.grants.manageOwners).to.equal(true)
    expect(siteRules.grants.managePagetrees).to.equal(false)
    expect(siteRules.grants.promotePagetree).to.equal(false)
    expect(siteRules.grants.rename).to.equal(true)
    expect(siteRules.grants.undelete).to.equal(false)
  })
  it.skip('should filter site rules by role ID', async () => {})
  it('should filter site rules by site ID', async () => {
    const sitesResp = await query('{ sites { id name } }')
    const site2 = sitesResp.data.sites.find((s: any) => s.name === 'site2')
    const resp = await query(`{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { siteIds: [${site2.id}] }) { id site { name } } } }`)
    for (const role of resp.data.roles) {
      if (role.name === 'site2-siterulestest1') expect(role.siteRules.length).to.be.greaterThan(0)
      else expect(role.siteRules.length).to.equal(0)
    }
  })
  it('should return site rules that grant the "launch" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { launch: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(0)
      }
    }
  })
  it('should return site rules that grant the "rename" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { rename: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(0)
      }
    }
  })
  it('should return site rules that grant the "manageOwners" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { manageOwners: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(0)
      }
    }
  })
  it('should return site rules that grant the "managePagetrees" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { managePagetrees: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(1)
      }
    }
  })
  it('should return site rules that grant the "promotePagetree" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { promotePagetree: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(1)
      }
    }
  })
  it('should return site rules that grant the "delete" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { delete: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(1)
      }
    }
  })
  it('should return site rules that grant the "undelete" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { undelete: true }) { id type } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules.length).to.equal(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules.length).to.equal(1)
      }
    }
  })
  it('should get the role attached to a site rule', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { id role { name } } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      const siteRuleRoleNames = role.siteRules.map((r: any) => r.role.name)
      expect(siteRuleRoleNames).to.contain(role.name)
    }
  })
  it('should get the site targeted by a site rule', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { id site { name } } } }')
    const roles = resp.data.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1' || role.name === 'site1-siterulestest2') {
        expect(role.siteRules[0].site.name).to.equal('site1')
      }
    }
  })
  it('should return null for the site of a site rule that targets all sites', async () => {
    const resp = await query('{ roles(filter: { users: ["ed05"] }) { name siteRules { id site { name } } } }')
    const role = resp.data.roles.find((r: any) => r.name === 'siteLauncher')
    expect(role.siteRules[0].site).to.equal(null)
  })
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
