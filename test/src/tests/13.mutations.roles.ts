/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('roles mutations', () => {
  it('should create a new role', async () => {
    const { createRole: { success, role } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleA' })
    expect(success).to.be.true
    expect(role.name).to.equal('roleA')
  })
  it('should return an error when trying to add a new role with an existing name', async () => {
    const { createRole: { success, messages } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success messages { message } } }', { name: 'editor' })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should update a role name', async () => {
    const { createRole: { role: roleB } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleB' })
    const { updateRole: { success, role } } = await query('mutation UpdateRole ($roleId: String!, $name: String!) { updateRole (roleId: $roleId, name: $name) { success role { id name } } }', { roleId: roleB.id, name: 'roleBUpdated' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleB.id}]}) { id name } }`)
    const roleNames = roles.map((r: any) => r.name)
    expect(roleNames).to.include('roleBUpdated')
    expect(roleNames).to.not.include('roleB')
  })
  it('should not update a role name if the new role name already exists', async () => {
    const { createRole: { role: roleC } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleC' })
    const { updateRole: { success, messages } } = await query('mutation UpdateRole ($roleId: String!, $name: String!) { updateRole (roleId: $roleId, name: $name) { success messages { message } } }', { roleId: roleC.id, name: 'editor' })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
})
