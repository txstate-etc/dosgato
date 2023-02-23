/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common.js'
import { hashify } from 'txstate-utils'

chai.use(chaiAsPromised)

describe('data rule mutations', () => {
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
  it('should create a data rule', async () => {
    const { role } = await createRole('datarulestestA')
    const { createDataRule: { success, dataRule } } =
    await query(`mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        dataRule {
          id
          role { id name }
          site { id name }
          path
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
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id, path: '/', grants: { create: false, update: true, delete: false, move: false, publish: true, unpublish: true, undelete: false } } })
    expect(success).to.be.true
    expect(dataRule.role.name).to.equal('datarulestesta')
    expect(dataRule.site.name).to.equal('site5')
    expect(dataRule.grants.create).to.be.false
    expect(dataRule.grants.update).to.be.true
    expect(dataRule.grants.view).to.be.true
    expect(dataRule.grants.delete).to.be.false
    expect(dataRule.grants.undelete).to.be.false
  })
  it('should not allow an unauthorized user to create a data rule', async () => {
    const { role } = await createRole('datarulestestB')
    await expect(queryAs('ed07', `mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        dataRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: role.id, siteId: sitehash.site5.id } })).to.be.rejected
  })
  it('should not allow a user to create a data rule with more privileges than they currently have', async () => {
    const { createDataRule: { success, messages } } = await queryAs('ed15', `mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        messages {
          message
        }
        dataRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: '1', path: '/', grants: { create: true, update: true, delete: true, move: true, publish: true, unpublish: true, undelete: true } } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
    expect(messages[0].message).to.equal('The proposed rule would have more privilege than you currently have, so you cannot create it.')
  })
  it('should update a data rule', async () => {
    const { role } = await createRole('datarulestestC')
    const { createDataRule: { dataRule } } = await query(`mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        dataRule {
          id
        }
      }
    }`, { args: { roleId: role.id, path: '/', grants: { create: true, update: true, delete: false, move: false, publish: false, unpublish: false, undelete: false } } })
    const { updateDataRule: { success, dataRule: dataRuleUpdated } } = await query(`mutation UpdateDataRule ($args: UpdateDataRuleInput!) {
      updateDataRule (args: $args) {
        success
        dataRule {
          id
          grants {
            create
            update
            move
            delete
          }
        }
      }
    }`, { args: { ruleId: dataRule.id, grants: { create: true, update: true, delete: true, move: true, publish: true, unpublish: true, undelete: false } } })
    expect(success).to.be.true
    expect(dataRuleUpdated.grants.delete).to.be.true
    expect(dataRuleUpdated.grants.move).to.be.true
  })
  it('should not allow an unauthorized user to update a data rule', async () => {
    await expect(queryAs('ed07', `mutation UpdateDataRule ($args: UpdateDataRuleInput!) {
      updateDataRule (args: $args) {
        success
        dataRule {
          id
        }
      }
    }`, { args: { ruleId: '1', templateId: 'keyd2' } })).to.be.rejected
  })
  it('should remove a data rule', async () => {
    const { role } = await createRole('datarulestestD')
    const { createDataRule: { dataRule } } = await query(`mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        dataRule {
          id
        }
      }
    }`, { args: { roleId: role.id, grants: { create: true, update: true, delete: false, move: true, publish: true, unpublish: true, undelete: false } } })
    const { removeRule: { success } } = await query(`mutation RemoveRule ($id: ID!, $type: RuleType!) {
      removeRule(ruleId: $id, type: $type) {
        success
      }
    }`, { id: dataRule.id, type: 'DATA' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${role.id}] }) { name dataRules { id } } }`)
    expect(roles[0].dataRules).to.not.deep.include({ id: dataRule.id })
  })
  it('should not allow an unauthorized user to remove a data rule', async () => {
    const { role } = await createRole('datarulestestE')
    const { createDataRule: { dataRule } } = await query(`mutation CreateDataRule ($args: CreateDataRuleInput!)
    {
      createDataRule (args: $args) {
        success
        dataRule {
          id
        }
      }
    }`, { args: { roleId: role.id, grants: { create: true, update: true, delete: true, move: true, publish: false, unpublish: false, undelete: true } } })
    await expect(queryAs('ed07', `mutation RemoveRule ($id: ID!, $type: RuleType!) {
      removeRule(ruleId: $id, type: $type) {
        success
      }
    }`, { id: dataRule.id, type: 'DATA' })).to.be.rejected
  })
})
