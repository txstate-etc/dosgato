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
  it('should delete a role', async () => {
    const { createRole: { role: roleD } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleD' })
    const { deleteRole: { success } } = await query('mutation DeleteRole ($roleId: String!) { deleteRole (roleId: $roleId) { success } }', { roleId: roleD.id })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleD.id}]} ) { id name } }`)
    expect(roles).to.have.lengthOf(0)
  })
  it('should assign a role to a user', async () => {
    const { createRole: { role: roleE } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleE' })
    const { assignRoleToUser: { success } } = await query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { assignRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleE.id, userId: 'ed01' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleE.id}]}) { id name users { id name } } }`)
    const role = roles.find((r: any) => r.id === roleE.id)
    expect(role.users.map((u: any) => u.id)).to.include('ed01')
  })
  it('should not assign a role to a non-existent user', async () => {
    const { createRole: { role: roleF } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleF' })
    await query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { assignRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleF.id, userId: 'fakeuser' })
    const { roles } = await query(`{ roles(filter: {ids: [${roleF.id}]}) { id name users { id name } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should remove a role from a user', async () => {
    const { createRole: { role: roleG } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleG' })
    const { assignRoleToUser: { success: addSuccess } } = await query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { assignRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleG.id, userId: 'ed02' })
    expect(addSuccess).to.be.true
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: String!, $userId: String!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleG.id, userId: 'ed02' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleG.id}]}) { id name users { id name } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should not remove a role from a user if the user does not have that role', async () => {
    const { createRole: { role: roleH } } = await query('mutation CreateRole ($name: String!) { createRole (name: $name) { success role { id name } } }', { name: 'roleH' })
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: String!, $userId: String!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleH.id, userId: 'su01' })
    expect(success).to.be.false
  })
})
