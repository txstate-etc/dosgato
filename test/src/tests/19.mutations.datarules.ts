/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common'

chai.use(chaiAsPromised)

describe('data rule mutations', () => {
  it('should create a data rule', async () => {
    const { role } = await createRole('datarulestestA')
    const { sites } = await query('{ sites { id name } }')
    const site5 = sites.find((s: any) => s.name === 'site5')
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
    }`, { args: { roleId: role.id, siteId: site5.id, path: '/', grants: { create: false, update: true, delete: false, move: false, publish: true, unpublish: true, undelete: false } } })
    expect(success).to.be.true
    expect(dataRule.role.name).to.equal('datarulestestA')
    expect(dataRule.site.name).to.equal('site5')
    expect(dataRule.grants.create).to.be.false
    expect(dataRule.grants.update).to.be.true
    expect(dataRule.grants.view).to.be.true
    expect(dataRule.grants.delete).to.be.false
    expect(dataRule.grants.undelete).to.be.false
  })
  it('should not allow an unauthorized user to create a data rule', async () => {
    const { role } = await createRole('datarulestestB')
    const { sites } = await query('{ sites { id name } }')
    const site5 = sites.find((s: any) => s.name === 'site5')
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
    }`, { args: { roleId: role.id, siteId: site5.id } })).to.be.rejected
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
          mode
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
    }`, { args: { ruleId: '1', templateId: '5' } })).to.be.rejected
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
  it.skip('should not allow an unauthorized user to remove a data rule', async () => {})
})
