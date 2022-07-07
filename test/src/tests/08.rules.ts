/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'
import { hashify } from 'txstate-utils'

describe('global rules', () => {
  it('should get global rules for a role', async () => {
    const resp = await query('{ roles(filter: { users: ["su01"] }) { name globalRules { grants { manageUsers } } } }')
    const superUserRole = resp.roles.find((r: any) => r.name === 'superuser')
    const globalRules = superUserRole.globalRules
    expect(globalRules).to.have.lengthOf(1)
    expect(globalRules[0].grants.manageUsers).to.be.true
  })
  it('should get the role attached to a global rule', async () => {
    const resp = await query('{ roles(filter: { users: ["su01"] }) { name globalRules { role { id name } } } }')
    const superUserRole = resp.roles.find((r: any) => r.name === 'superuser')
    const globalRules = superUserRole.globalRules
    expect(globalRules[0].role.name).to.equal('superuser')
  })
})

describe('site rules', () => {
  it('should get the site rules for a role', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { grants { delete launch manageOwners managePagetrees promotePagetree rename undelete viewForEdit } } } }')
    const testrole1 = resp.roles.find((r: any) => r.name === 'site1-siterulestest1')
    const siteRules = testrole1.siteRules[0]
    expect(siteRules.grants.delete).to.be.false
    expect(siteRules.grants.launch).to.be.true
    expect(siteRules.grants.manageOwners).to.be.true
    expect(siteRules.grants.managePagetrees).to.be.false
    expect(siteRules.grants.promotePagetree).to.be.false
    expect(siteRules.grants.rename).to.be.true
    expect(siteRules.grants.undelete).to.be.false
    expect(siteRules.grants.viewForEdit).to.be.true
  })
  it('should filter site rules by role ID', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { id name } }')
    const site1siterulestest1 = resp.roles.find((r: any) => r.name === 'site1-siterulestest1')
    const { roles } = await query(`{ roles(filter: { users: ["su01", "ed06"] }) { id name siteRules(filter: { roleIds: [${site1siterulestest1.id}]}) { grants { delete launch viewForEdit } } } }`)
    for (const role of roles) {
      if (role.id === site1siterulestest1.id) expect(role.siteRules.length).to.be.greaterThan(0)
      else expect(role.siteRules.length).to.equal(0)
    }
  })
  it('should filter site rules by site ID', async () => {
    const sitesResp = await query('{ sites { id name } }')
    const site2 = sitesResp.sites.find((s: any) => s.name === 'site2')
    const resp = await query(`{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { siteIds: [${site2.id}] }) { id site { name } } } }`)
    for (const role of resp.roles) {
      if (role.name === 'site2-siterulestest1') expect(role.siteRules).to.have.length.greaterThan(0)
      else expect(role.siteRules).to.have.lengthOf(0)
    }
  })
  it('should return site rules that grant the "launch" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { launch: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(0)
      }
    }
  })
  it('should return site rules that grant the "rename" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { rename: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(0)
      }
    }
  })
  it('should return site rules that grant the "manageOwners" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { manageOwners: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(1)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(0)
      }
    }
  })
  it('should return site rules that grant the "managePagetrees" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { managePagetrees: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(1)
      }
    }
  })
  it('should return site rules that grant the "promotePagetree" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { promotePagetree: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(1)
      }
    }
  })
  it('should return site rules that grant the "delete" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { delete: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(1)
      }
    }
  })
  it('should return site rules that grant the "undelete" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules(filter: { undelete: true }) { id type } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1') {
        expect(role.siteRules).to.have.lengthOf(0)
      } else if (role.name === 'site1-siterulestest2') {
        expect(role.siteRules).to.have.lengthOf(1)
      }
    }
  })
  it('should get the role attached to a site rule', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { id role { name } } } }')
    const roles = resp.roles
    for (const role of roles) {
      const siteRuleRoleNames = role.siteRules.map((r: any) => r.role.name)
      if (siteRuleRoleNames.length) {
        expect(siteRuleRoleNames).to.have.members([role.name])
      }
    }
  })
  it('should get the site targeted by a site rule', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { name siteRules { id site { name } } } }')
    const roles = resp.roles
    for (const role of roles) {
      if (role.name === 'site1-siterulestest1' || role.name === 'site1-siterulestest2') {
        expect(role.siteRules[0].site.name).to.equal('site1')
      }
    }
  })
  it('should return null for the site of a site rule that targets all sites', async () => {
    const resp = await query('{ roles(filter: { users: ["ed05"] }) { name siteRules { id site { name } } } }')
    const role = resp.roles.find((r: any) => r.name === 'siteLauncher')
    expect(role.siteRules[0].site).to.be.null
  })
})

describe('asset rules', () => {
  it('should get the asset rules for a role', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed06"] }) { name assetRules { grants { create delete move undelete update view viewForEdit } } } }')
    const assetruletest1 = roles.find((r: any) => r.name === 'assetrulestest1')
    expect(assetruletest1.assetRules).to.deep.include({ grants: { create: true, update: true, move: true, delete: false, undelete: false, view: true, viewForEdit: true } })
  })
  it('should filter asset rules by site ID', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const { roles } = await query(`{ roles(filter: { users: ["ed06"] }) { name assetRules(filter: { siteIds: [${site1.id}]}) {site { id name } } } }`)
    const assetruletest1 = roles.find((r: any) => r.name === 'assetrulestest1')
    for (const rule of assetruletest1.assetRules) {
      expect(rule.site.name).to.equal('site1')
    }
  })
  it('should filter asset rules by null site ID', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed06"] }) { name assetRules(filter: { siteIds: [null]}) {site { id name } grants { create move } } } }')
    const assetruletest5 = roles.find((r: any) => r.name === 'assetrulestest5')
    for (const rule of assetruletest5.assetRules) {
      expect(rule.site).to.be.null
      expect(rule.grants.create).to.be.false
      expect(rule.grants.move).to.be.true
    }
  })
  it('should filter asset rules by role ID', async () => {
    const resp = await query('{ roles(filter: { users: ["ed06"] }) { id name } }')
    const assetruletest1 = resp.roles.find((r: any) => r.name === 'assetrulestest1')
    const { roles } = await query(`{ roles(filter: { users: ["ed06"] }) { name assetRules(filter: { roleIds: [${assetruletest1.id}] }) { role { id name } grants { create delete move undelete update view viewForEdit } } } }`)
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.role.name).to.equal('assetrulestest1')
      }
    }
  })
  it('should filter asset rules by path', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed06"] }) { name assetRules(filter: { paths: ["/site1/images"]}) { path grants { create update move delete undelete } } } }')
    const assetruletest5 = roles.find((r: any) => r.name === 'assetrulestest5')
    for (const rule of assetruletest5.assetRules) {
      expect(rule.path).to.equal('/site1/images')
    }
  })
  it('should return asset rules that grant the "create" permission', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules(filter: { create: true }) { grants { create update move delete undelete } } } }')
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.grants.create).to.be.true
      }
    }
  })
  it('should return asset rules that grant the "update" permission', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules(filter: { update: true }) { grants { create update move delete undelete } } } }')
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.grants.update).to.be.true
      }
    }
  })
  it('should return asset rules that grant the "move" permission', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules(filter: { move: true }) { grants { create update move delete undelete } } } }')
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.grants.move).to.be.true
      }
    }
  })
  it('should return asset rules that grant the "delete" permission', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules(filter: { delete: true }) { grants { create update move delete undelete } } } }')
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.grants.delete).to.be.true
      }
    }
  })
  it('should return asset rules that grant the "undelete" permission', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules(filter: { undelete: true }) { grants { create update move delete undelete } } } }')
    for (const role of roles) {
      for (const rule of role.assetRules) {
        expect(rule.grants.undelete).to.be.true
      }
    }
  })
  it('should get the role attached to an asset rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed06"] }) { name assetRules { id role { name } } } }')
    for (const role of roles) {
      const assetRuleRoleNames = role.assetRules.map((r: any) => r.role.name)
      if (assetRuleRoleNames.length) {
        expect(assetRuleRoleNames).to.include.members([role.name])
      }
    }
  })
  it('should get the site targeted by an asset rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { name assetRules { id site { name } } } }')
    for (const role of roles) {
      if (role.name === 'assetrulestest3' || role.name === 'assetrulestest4') {
        expect(role.assetRules[0].site.name).to.equal('site1')
      }
    }
  })
  it('should return null for the site of an asset rule that targets all sites', async () => {
    const { roles } = await query('{ roles(filter: { users: ["su01"] }) { name assetRules { id site { name } } } }')
    const superUserRole = roles.find((r: any) => r.name === 'superuser')
    expect(superUserRole.assetRules[0].site).to.be.null
  })
})

describe('page rules', () => {
  it('should get the page rules for a role', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed12"] }) { name pageRules { site { name } pagetreeType path mode grants { view viewlatest viewForEdit update move create publish unpublish delete undelete } } } }')
    const pageruletest1 = roles.find((r: any) => r.name === 'pagerulestest1')
    expect(pageruletest1.pageRules).to.deep.include({ site: { name: 'site5' }, pagetreeType: 'PRIMARY', path: '/site5', mode: 'SELFANDSUB', grants: { view: true, viewlatest: true, viewForEdit: true, update: true, move: true, create: true, publish: true, unpublish: true, delete: false, undelete: false } })
  })
  it('should get the role attached to a page rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed12"] }) { name pageRules { id role { name } } } }')
    const test1role = roles.find((r: any) => r.name === 'pagerulestest1')
    for (const rule of test1role.pageRules) {
      expect(rule.role.name).to.equal('pagerulestest1')
    }
  })
  it('should get the site targeted by a page rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed12"] }) { name pageRules { id site { name } } } }')
    const test1role = roles.find((r: any) => r.name === 'pagerulestest1')
    expect(test1role.pageRules.map((r: any) => r.site.name)).to.have.members(['site5'])
  })
  it('should return null for the site of a page rule that targets all sites', async () => {
    const { roles } = await query('{ roles(filter: { users: ["su01"] }) { name pageRules { id site { name } } } }')
    const superuserrole = roles.find((r: any) => r.name === 'superuser')
    expect(superuserrole.pageRules[0].site).to.be.null
  })
  it('should get the pagetree type targeted by a page rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed12"] }) { name pageRules { id pagetreeType } } }')
    const test2role = roles.find((r: any) => r.name === 'pagerulestest2')
    expect(test2role.pageRules.map((r: any) => r.pagetreeType)).to.include.members(['PRIMARY'])
  })
  it('should return null for the pagetree type of a page rule that targets all pagetree types', async () => {
    const { roles } = await query('{ roles(filter: { users: ["su01"] }) { name pageRules { id pagetreeType } } }')
    const superuserrole = roles.find((r: any) => r.name === 'superuser')
    expect(superuserrole.pageRules[0].pagetreeType).to.be.null
  })
})

describe('data rules', () => {
  it('should get the data rules for a role', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed14"] }) { name dataRules { path grants { view viewlatest viewForEdit create update move publish unpublish delete undelete } } } }')
    const dataruletest1 = roles.find((r: any) => r.name === 'datarulestest1')
    expect(dataruletest1.dataRules).to.deep.include({ path: '/', grants: { view: true, viewlatest: true, viewForEdit: true, create: true, update: true, move: true, publish: false, unpublish: false, delete: false, undelete: false } })
  })
  it('should get the role attached to a data rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed14"] }) { name dataRules { id role { name } } } }')
    const test1role = roles.find((r: any) => r.name === 'datarulestest1')
    for (const rule of test1role.dataRules) {
      expect(rule.role.name).to.equal('datarulestest1')
    }
  })
  it('should get the site targeted by a data rule', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed14"] }) { name dataRules { id site { name } } } }')
    const test2role = roles.find((r: any) => r.name === 'datarulestest2')
    expect(test2role.dataRules.map((r: any) => r.site.name)).to.have.members(['site4'])
  })
  it('should return null for the site of a data rule that targets all sites', async () => {
    const { roles } = await query('{ roles(filter: { users: ["su01"] }) { name dataRules { id site { name } } } }')
    const superuserrole = roles.find((r: any) => r.name === 'superuser')
    expect(superuserrole.dataRules[0].site).to.be.null
  })
  it('should get the data template for which a data rule applies', async () => {
    const { roles } = await query('{ roles(filter: { users: ["ed15"] }) { name dataRules { template { key } } } }')
    const test4role = roles.find((r: any) => r.name === 'datarulestest4')
    expect(test4role.dataRules).to.deep.include({ template: { key: 'keyd1' } })
  })
  it('should return null for the data template of a data rule that targets all data templates', async () => {
    const { roles } = await query('{ roles(filter: { users: ["su01"] }) { name dataRules { template { key } } } }')
    const superuserrole = roles.find((r: any) => r.name === 'superuser')
    expect(superuserrole.dataRules[0].template).to.be.null
  })
})

describe('template rules', () => {
  it('should get the template rules for a role', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules { id template { name } } } }')
    const test1role = resp.roles.find((r: any) => r.name === 'templaterulestest1')
    const templates = test1role.templateRules.map((r: any) => r.template.name)
    expect(templates).to.have.members(['pagetemplate1', 'pagetemplate2', 'pagetemplate3'])
  })
  it('should filter template rules by role ID', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { id name } }')
    const templateruletest1 = resp.roles.find((r: any) => r.name === 'templaterulestest1')
    const { roles } = await query(`{ roles(filter: { users: ["ed07"] }) { name templateRules(filter: { roleIds: [${templateruletest1.id}] }) { role { id name } grants { use } } } }`)
    for (const role of roles) {
      for (const rule of role.templateRules) {
        expect(rule.role.name).to.equal('templaterulestest1')
      }
    }
  })
  it('should filter template rules by template key', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules(filter: {templateKeys: ["keyp1"]}) { id template { name } } } }')
    const test1role = resp.roles.find((r: any) => r.name === 'templaterulestest1')
    const test2role = resp.roles.find((r: any) => r.name === 'templaterulestest2')
    const templates = test1role.templateRules.map((r: any) => r.template.name)
    expect(templates).to.have.members(['pagetemplate1'])
    expect(templates).to.not.have.members(['pagetemplate2', 'pagetemplate3'])
    expect(test2role.templateRules).to.have.lengthOf(0)
  })
  it('should filter template rules by template key, including null', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules(filter: {templateKeys: ["keyp1", null]}) { id template { name } } } }')
    const test2role = resp.roles.find((r: any) => r.name === 'templaterulestest2')
    expect(test2role.templateRules).to.have.lengthOf(1)
    expect(test2role.templateRules[0].template).to.be.null
  })
  it('should filter template rules on whether they grant the "use" permission', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules(filter: { use: true }) { id template { name } } } }')
    const test1role = resp.roles.find((r: any) => r.name === 'templaterulestest1')
    const templates = test1role.templateRules.map((r: any) => r.template.name)
    expect(templates).to.have.members(['pagetemplate1', 'pagetemplate2'])
    expect(templates).to.not.have.members(['pagetemplate3'])
  })
  it('should get the role attached to a template rule', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules { id role { name } } } }')
    const test1role = resp.roles.find((r: any) => r.name === 'templaterulestest1')
    expect(test1role.templateRules[0].role.name).to.equal(test1role.name)
  })
  it('should return null for the template of a template rule that targets all templates', async () => {
    const resp = await query('{ roles(filter: { users: ["ed07"] }) { name templateRules(filter: {templateKeys: [null]}) { id template { name } } } }')
    const test2role = resp.roles.find((r: any) => r.name === 'templaterulestest2')
    expect(test2role.templateRules[0].template).to.be.null
  })
})
