/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common'

chai.use(chaiAsPromised)

describe('asset rule mutations', () => {
  it('should create an asset rule', async () => {
    const { role } = await createRole('assetrulestestA')
    const { sites } = await query('{ sites { id name } }')
    const site4 = sites.find((s: any) => s.name === 'site4')
    const { createAssetRule: { success, assetRule } } =
    await query(`mutation CreateAssetRule ($args: CreateAssetRuleInput!)
    {
      createAssetRule (args: $args) {
        success
        assetRule {
          id
          role { id name }
          site { id name }
          path
          mode
          grants {
            create
            update
            delete
            move
            undelete
            view
            viewForEdit
          }
        }
      }
    }`, { args: { roleId: role.id, siteId: site4.id, path: '/', mode: 'SELFANDSUB', grants: { create: true, update: true, move: true, delete: false, undelete: false } } })
    expect(success).to.be.true
    expect(assetRule.role.name).to.equal('assetrulestestA')
    expect(assetRule.site.name).to.equal('site4')
    expect(assetRule.grants.create).to.be.true
    expect(assetRule.grants.view).to.be.true
    expect(assetRule.grants.delete).to.be.false
  })
  it('should not allow an unauthorized user to create an asset rule', async () => {
    await expect(queryAs('ed07', `mutation CreateAssetRule ($args: CreateAssetRuleInput!)
    {
      createAssetRule (args: $args) {
        success
        assetRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: '1', siteId: '1', path: '/', mode: 'SELFANDSUB', grants: { create: true, update: false, move: false, delete: false, undelete: false } } })).to.be.rejected
  })
  it('should not allow a user to create an asset rule with more privileges than they currently have', async () => {
    const { sites } = await query('{ sites { id name } }')
    const site1 = sites.find((s: any) => s.name === 'site1')
    const { roles } = await query('{ roles(filter: { users: ["ed11"] }) { id name } }')
    const assetrulestest4 = roles.find((r: any) => r.name === 'assetrulestest4')
    // trying to add move permission when ed11 doesn't have move permission
    const { createAssetRule: { success, messages } } = await queryAs('ed11', `mutation CreateAssetRule ($args: CreateAssetRuleInput!)
    {
      createAssetRule (args: $args) {
        success
        messages {
          message
        }
        assetRule {
          id
          role { id name }
          site { id name }
          grants {
            create
          }
        }
      }
    }`, { args: { roleId: assetrulestest4.id, siteId: site1.id, path: '/', mode: 'SELFANDSUB', grants: { create: true, update: false, move: true, delete: true, undelete: true } } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should update an asset rule', async () => {
    const { role } = await createRole('assetrulestestB')
    const { sites } = await query('{ sites { id name } }')
    const site4 = sites.find((s: any) => s.name === 'site4')
    const { createAssetRule: { assetRule } } = await query(`mutation CreateAssetRule ($args: CreateAssetRuleInput!)
    {
      createAssetRule (args: $args) {
        success
        assetRule {
          id
        }
      }
    }`, { args: { roleId: role.id, siteId: site4.id, path: '/', mode: 'SELF', grants: { create: false, update: true, move: false, delete: false, undelete: false } } })
    const { updateAssetRule: { success, assetRule: assetRuleUpdated } } = await query(`mutation UpdateAssetRule ($args: UpdateAssetRuleInput!) {
      updateAssetRule (args: $args) {
        success
        assetRule {
          id
          mode
          grants {
            create
            update
            move
          }
        }
      }
    }`, { args: { ruleId: assetRule.id, mode: 'SELFANDSUB', grants: { create: true, update: true, move: true, delete: false, undelete: false } } })
    expect(success).to.be.true
    expect(assetRuleUpdated.mode).to.equal('SELFANDSUB')
    expect(assetRuleUpdated.grants.create).to.be.true
  })
  it('should not allow an unauthorized user to update an asset rule', async () => {
    await expect(queryAs('ed07', `mutation UpdateAssetRule ($args: UpdateAssetRuleInput!) {
      updateAssetRule (args: $args) {
        success
        assetRule {
          id
        }
      }
    }`, { args: { ruleId: '1', mode: 'SUB' } })).to.be.rejected
  })
  it('should remove an asset rule', async () => {
    const { role } = await createRole('assetrulestestC')
    const { sites } = await query('{ sites { id name } }')
    const site4 = sites.find((s: any) => s.name === 'site4')
    const { createAssetRule: { assetRule } } = await query(`mutation CreateAssetRule ($args: CreateAssetRuleInput!)
    {
      createAssetRule (args: $args) {
        success
        assetRule {
          id
        }
      }
    }`, { args: { roleId: role.id, siteId: site4.id, path: '/', mode: 'SELF', grants: { create: false, update: true, move: false, delete: false, undelete: false } } })
    const { removeRule: { success } } = await query(`mutation RemoveRule ($id: ID!, $type: RuleType!) {
      removeRule(ruleId: $id, type: $type) {
        success
      }
    }`, { id: assetRule.id, type: 'ASSET' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${role.id}] }) { name assetRules { id } } }`)
    expect(roles[0].assetRules).to.not.deep.include({ id: assetRule.id })
  })
  it.skip('should not allow an unauthorized user to remove an asset rule', async () => {})
})
