/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common.js'

chai.use(chaiAsPromised)

describe('roles mutations', () => {
  it('should create a new role', async () => {
    const { success, role } = await createRole('roleA')
    expect(success).to.be.true
    expect(role.name).to.equal('roleA')
  })
  it('should return an error when trying to add a new role with an existing name', async () => {
    const { success, messages } = await createRole('editor')
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a role', async () => {
    await expect(createRole('doesnotmatter', 'ed07')).to.be.rejected
  })
  it('should update a role name', async () => {
    const { role: roleB } = await createRole('roleB')
    const { updateRole: { success } } = await query('mutation UpdateRole ($roleId: String!, $name: String!) { updateRole (roleId: $roleId, name: $name) { success role { id name } } }', { roleId: roleB.id, name: 'roleBUpdated' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleB.id}]}) { id name } }`)
    const roleNames = roles.map((r: any) => r.name)
    expect(roleNames).to.include('roleBUpdated')
    expect(roleNames).to.not.include('roleB')
  })
  it('should not update a role name if the new role name already exists', async () => {
    const { role: roleC } = await createRole('roleC')
    const { updateRole: { success, messages } } = await query('mutation UpdateRole ($roleId: String!, $name: String!) { updateRole (roleId: $roleId, name: $name) { success messages { message } } }', { roleId: roleC.id, name: 'editor' })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to update a role name', async () => {
    const { role: roleBB } = await createRole('roleBB')
    await expect(queryAs('ed07', 'mutation UpdateRole ($roleId: String!, $name: String!) { updateRole (roleId: $roleId, name: $name) { success role { id name } } }', { roleId: roleBB.id, name: 'roleBUpdated' })).to.be.rejected
  })
  it('should delete a role', async () => {
    const { role: roleD } = await createRole('roleD')
    const { deleteRole: { success } } = await query('mutation DeleteRole ($roleId: String!) { deleteRole (roleId: $roleId) { success } }', { roleId: roleD.id })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleD.id}]} ) { id name } }`)
    expect(roles).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to delete a role', async () => {
    const { role: roleDD } = await createRole('roleDD')
    await expect(queryAs('ed07', 'mutation DeleteRole ($roleId: String!) { deleteRole (roleId: $roleId) { success } }', { roleId: roleDD.id })).to.be.rejected
  })
  it('should assign a role to a user', async () => {
    const { role: roleE } = await createRole('roleE')
    const { addRoleToUser: { success } } = await query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { addRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleE.id, userId: 'ed01' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleE.id}]}) { id name users { id name } } }`)
    const role = roles.find((r: any) => r.id === roleE.id)
    expect(role.users.map((u: any) => u.id)).to.include('ed01')
  })
  it('should not assign a role to a non-existent user', async () => {
    const { role: roleF } = await createRole('roleF')
    await expect(query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { addRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleF.id, userId: 'fakeuser' })).to.be.rejected
    const { roles } = await query(`{ roles(filter: {ids: [${roleF.id}]}) { id name users { id name } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to assign a role to a user', async () => {
    const { role: roleEE } = await createRole('roleEE')
    await expect(queryAs('ed07', 'mutation AssignRoleToUser ($roleId: String!, $userId: String!) { addRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleEE.id, userId: 'ed01' })).to.be.rejected
  })
  it('should remove a role from a user', async () => {
    const { role: roleG } = await createRole('roleG')
    const { addRoleToUser: { success: addSuccess } } = await query('mutation AssignRoleToUser ($roleId: String!, $userId: String!) { addRoleToUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleG.id, userId: 'ed02' })
    expect(addSuccess).to.be.true
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: String!, $userId: String!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleG.id, userId: 'ed02' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleG.id}]}) { id name users { id name } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should not remove a role from a user if the user does not have that role', async () => {
    const { role: roleH } = await createRole('roleH')
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: String!, $userId: String!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleH.id, userId: 'su01' })
    expect(success).to.be.false
  })
  it.skip('should allow a site manager to assign the site\'s role to a user', async () => {
    // TODO: this test is skipped until we have createSite also creating the site's base role
  })
})
