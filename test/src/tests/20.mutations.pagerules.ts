/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common.js'
import { hashify } from 'txstate-utils'

chai.use(chaiAsPromised)

describe('page rule mutations', () => {
  let sitehash: any
  let sites: any
  before(async () => {
    const resp = await query(`
    {
      sites {
        id
        name
      }
    }`)
    sites = resp.sites
    sitehash = hashify(sites, 'name')
  })
  it('should create a page rule', async () => {
    const { role } = await createRole('pagerulestestA')
    const { createPageRule: { success, pageRule } } =
    await query(`mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        pageRule {
          id
          role { id name }
          site { id name }
          pagetreeType
          path
          mode
          grants {
            create
            update
            delete
            move
            publish
            undelete
            unpublish
            view
            viewForEdit
            viewlatest
          }
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', mode: 'SELFANDSUB', grants: { create: false, update: true, delete: false, move: false, publish: true, unpublish: true, undelete: false } } })
    expect(success).to.be.true
    expect(pageRule.role.name).to.equal('pagerulestesta')
    expect(pageRule.site.name).to.equal('site5')
    expect(pageRule.grants.create).to.be.false
    expect(pageRule.grants.update).to.be.true
    expect(pageRule.grants.view).to.be.true
    expect(pageRule.grants.delete).to.be.false
    expect(pageRule.grants.undelete).to.be.false
  })
  it('should not allow an unauthorized user to create a page rule', async () => {
    const { role } = await createRole('pagerulestestB')
    await expect(queryAs('ed07', `mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        pageRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', mode: 'SELFANDSUB' } })).to.be.rejected
  })
  it('should not allow a user to create a page rule with more privileges than they currently have', async () => {
    const { createPageRule: { success, messages } } = await queryAs('ed13', `mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        messages {
          message
        }
        pageRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: '1', siteId: '1', path: '/', mode: 'SELFANDSUB', grants: { create: true, update: true, delete: true, move: true, publish: true, unpublish: true, undelete: true } } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
    expect(messages[0].message).to.equal('The proposed rule would have more privilege than you currently have, so you cannot create it.')
  })
  it('should update a page rule', async () => {
    const { role } = await createRole('pagerulestestC')
    const { createPageRule: { pageRule } } = await query(`mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        pageRule {
          id
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', mode: 'SELF', grants: { create: false, update: true, delete: false, move: false, publish: false, unpublish: false, undelete: false } } })
    const { updatePageRule: { success, pageRule: pageRuleUpdated } } = await query(`mutation UpdatePageRule ($args: UpdatePageRuleInput!) {
      updatePageRule (args: $args) {
        success
        pageRule {
          id
          mode
          grants {
            create
            update
            move
          }
        }
      }
    }`, { args: { ruleId: pageRule.id, mode: 'SELFANDSUB', grants: { create: true, update: true, delete: false, move: true, publish: true, unpublish: true, undelete: false } } })
    expect(success).to.be.true
    expect(pageRuleUpdated.mode).to.equal('SELFANDSUB')
    expect(pageRuleUpdated.grants.create).to.be.true
  })
  it('should not allow an unauthorized user to update a page rule', async () => {
    await expect(queryAs('ed07', `mutation UpdatePageRule ($args: UpdatePageRuleInput!) {
      updatePageRule (args: $args) {
        success
        pageRule {
          id
        }
      }
    }`, { args: { ruleId: '1', mode: 'SUB' } })).to.be.rejected
  })
  it('should remove a page rule', async () => {
    const { role } = await createRole('pagerulestestD')
    const { createPageRule: { pageRule } } = await query(`mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        pageRule {
          id
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', mode: 'SELF', grants: { create: true, update: true, delete: false, move: true, publish: true, unpublish: true, undelete: false } } })
    const { removeRule: { success } } = await query(`mutation RemoveRule ($id: ID!, $type: RuleType!) {
      removeRule(ruleId: $id, type: $type) {
        success
      }
    }`, { id: pageRule.id, type: 'PAGE' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${role.id}] }) { name pageRules { id } } }`)
    expect(roles[0].pageRules).to.not.deep.include({ id: pageRule.id })
  })
  it('should not allow an unauthorized user to remove a page rule', async () => {
    const { role } = await createRole('pagerulestestE')
    const { createPageRule: { pageRule } } = await query(`mutation CreatePageRule ($args: CreatePageRuleInput!)
    {
      createPageRule (args: $args) {
        success
        pageRule {
          id
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', mode: 'SELF', grants: { create: true, update: false, delete: false, move: false, publish: false, unpublish: false, undelete: false } } })
    await expect(queryAs('ed07', `mutation RemoveRule ($id: ID!, $type: RuleType!) {
      removeRule(ruleId: $id, type: $type) {
        success
      }
    }`, { id: pageRule.id, type: 'PAGE' })).to.be.rejected
  })
})
