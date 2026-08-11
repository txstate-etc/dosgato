import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs, createRole } from '../common.js'

use(chaiAsPromised)

async function getSiteId (name: string) {
  const { sites } = await query('{ sites { id name } }')
  return sites.find((s: any) => s.name === name).id
}

describe('roles mutations', () => {
  it('should create a new role', async () => {
    const { success, role } = await createRole({ name: 'roleA' })
    expect(success).to.be.true
    expect(role.name).to.equal('rolea')
  })
  it ('should create a new role with description', async () => {
    const { success, role } = await createRole({ name: 'role with description', description: 'This is a test role' })
    expect(success).to.be.true
    expect(role.description).to.equal('This is a test role')
  })
  it ('should create a new role with access level', async () => {
    const { success, role } = await createRole({ name: 'role with access level', access: 'EDITOR' })
    expect(success).to.be.true
    expect(role.access).to.equal('EDITOR')
  })
  it('should return an error when trying to add a new role with an existing name', async () => {
    const { success, messages } = await createRole({ name: 'editor' })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a role', async () => {
    await expect(createRole({ name: 'doesnotmatter' }, 'ed07')).to.be.rejected
  })
  it('should update a role name', async () => {
    const { role: roleB } = await createRole({ name: 'roleB' })
    const { updateRole: { success } } = await query('mutation UpdateRole ($roleId: ID!, $input: RoleInput!) { updateRole (roleId: $roleId, input: $input) { success role { id name } } }', { roleId: roleB.id, input: { name: 'roleBUpdated' } })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleB.id}]}) { id name } }`)
    const roleNames = roles.map((r: any) => r.name)
    expect(roleNames).to.include('rolebupdated')
    expect(roleNames).to.not.include('roleB')
  })
  it('should not update a role name if the new role name already exists', async () => {
    const { role: roleC } = await createRole({ name: 'roleC' })
    const { updateRole: { success, messages } } = await query('mutation UpdateRole ($roleId: ID!, $input: RoleInput!) { updateRole (roleId: $roleId, input: $input) { success messages { message } } }', { roleId: roleC.id, input: { name: 'editor' } })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to update a role name', async () => {
    const { role: roleBB } = await createRole({ name: 'roleBB' })
    await expect(queryAs('ed07', 'mutation UpdateRole ($roleId: String!, $name: UrlSafeString!) { updateRole (roleId: $roleId, name: $name) { success role { id name } } }', { roleId: roleBB.id, name: 'roleBUpdated' })).to.be.rejected
  })
  it('should add a description and access level to a role', async () => {
    const { role: roleCC } = await createRole({ name: 'roleCC' })
    const { updateRole: { success } } = await query('mutation UpdateRole ($roleId: ID!, $input: RoleInput!) { updateRole (roleId: $roleId, input: $input) { success role { id name description access } } }', { roleId: roleCC.id, input: { name: 'roleCC', description: 'This is roleCC', access: 'READONLY' } })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleCC.id}]}) { id name description access } }`)
    expect(roles[0].description).to.equal('This is roleCC')
    expect(roles[0].access).to.equal('READONLY')
  })
  it('should delete a role', async () => {
    const { role: roleD } = await createRole({ name: 'roleD' })
    const { deleteRole: { success } } = await query('mutation DeleteRole ($roleId: ID!) { deleteRole (roleId: $roleId) { success } }', { roleId: roleD.id })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: { ids: [${roleD.id}]} ) { id name } }`)
    expect(roles).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to delete a role', async () => {
    const { role: roleDD } = await createRole({ name: 'roleDD' })
    await expect(queryAs('ed07', 'mutation DeleteRole ($roleId: ID!) { deleteRole (roleId: $roleId) { success } }', { roleId: roleDD.id })).to.be.rejected
  })
  it('should assign a role to a user', async () => {
    const { role: roleE } = await createRole({ name: 'roleE' })
    const { addRolesToUser: { success } } = await query('mutation AssignRolesToUser ($roleIds: [ID!]!, $userId: ID!) { addRolesToUser (roleIds: $roleIds, userId: $userId) { success } }', { roleIds: [roleE.id], userId: 'ed01' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleE.id}]}) { id name users { id firstname lastname } } }`)
    const role = roles.find((r: any) => r.id === roleE.id)
    expect(role.users.map((u: any) => u.id)).to.include('ed01')
  })
  it('should not assign a role to a non-existent user', async () => {
    const { role: roleF } = await createRole({ name: 'roleF' })
    await expect(query('mutation AssignRoleToUser ($roleIds: [ID!]!, $userId: ID!) { addRolesToUser (roleIds: $roleIds, userId: $userId) { success } }', { roleIds: [roleF.id], userId: 'fakeuser' })).to.be.rejected
    const { roles } = await query(`{ roles(filter: {ids: [${roleF.id}]}) { id name users { id firstname lastname } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to assign a role to a user', async () => {
    const { role: roleEE } = await createRole({ name: 'roleEE' })
    await expect(queryAs('ed07', 'mutation AssignRoleToUser ($roleIds: [ID!]!, $userId: String!) { addRoleToUser (roleIds: $roleIds, userId: $userId) { success } }', { roleId: [roleEE.id], userId: 'ed01' })).to.be.rejected
  })
  it('should remove a role from a user', async () => {
    const { role: roleG } = await createRole({ name: 'roleG' })
    const { addRolesToUser: { success: addSuccess } } = await query('mutation AssignRolesToUser ($roleIds: [ID!]!, $userId: ID!) { addRolesToUser (roleIds: $roleIds, userId: $userId) { success } }', { roleIds: [roleG.id], userId: 'ed02' })
    expect(addSuccess).to.be.true
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: ID!, $userId: ID!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleG.id, userId: 'ed02' })
    expect(success).to.be.true
    const { roles } = await query(`{ roles(filter: {ids: [${roleG.id}]}) { id name users { id firstname lastname } } }`)
    expect(roles[0].users).to.have.lengthOf(0)
  })
  it('should not remove a role from a user if the user does not have that role', async () => {
    const { role: roleH } = await createRole({ name: 'roleH' })
    const { removeRoleFromUser: { success } } = await query('mutation RemoveRoleFromUser ($roleId: ID!, $userId: ID!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: roleH.id, userId: 'su01' })
    expect(success).to.be.false
  })
  it('should allow a site owner to assign a role belonging to their site', async () => {
    const site1 = await getSiteId('site1')
    const { role } = await createRole({ name: 'ownerassigntest', siteId: site1, access: 'CONTRIBUTOR' })
    // ed02 owns site1 and has no manageAccess
    const { assignRoleToUsers: { success } } = await queryAs('ed02', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })
    expect(success).to.be.true
    const { roles } = await query(`{ roles (filter: { ids: [${role.id}] }) { id users { id } } }`)
    expect(roles[0].users.map((u: any) => u.id)).to.include('ed09')
  })
  it('should allow a site manager to assign a role belonging to their site', async () => {
    const site3 = await getSiteId('site3')
    const { role } = await createRole({ name: 'managerassigntest', siteId: site3, access: 'CONTRIBUTOR' })
    // ed01 manages site3 and has no manageAccess
    const { assignRoleToUsers: { success } } = await queryAs('ed01', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })
    expect(success).to.be.true
  })
  it('should allow a site owner to remove a role belonging to their site from a user', async () => {
    const site1 = await getSiteId('site1')
    const { role } = await createRole({ name: 'ownerremovetest', siteId: site1, access: 'CONTRIBUTOR' })
    await queryAs('ed02', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })
    const { removeRoleFromUser: { success } } = await queryAs('ed02', 'mutation RemoveRoleFromUser ($roleId: ID!, $userId: ID!) { removeRoleFromUser (roleId: $roleId, userId: $userId) { success } }', { roleId: role.id, userId: 'ed09' })
    expect(success).to.be.true
  })
  it('should not allow someone who neither owns nor manages a site to assign that site\'s role', async () => {
    const site1 = await getSiteId('site1')
    const { role } = await createRole({ name: 'nonownerassigntest', siteId: site1, access: 'CONTRIBUTOR' })
    await expect(queryAs('ed07', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })).to.be.rejected
  })
  it('should not allow a site owner to assign a role belonging to a different site', async () => {
    const site3 = await getSiteId('site3')
    const { role } = await createRole({ name: 'othersiteassigntest', siteId: site3, access: 'CONTRIBUTOR' })
    // ed02 owns site1, not site3
    await expect(queryAs('ed02', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })).to.be.rejected
  })
  it('should not allow a site owner to assign a role that does not belong to any site', async () => {
    const { role } = await createRole({ name: 'nositeassigntest' })
    await expect(queryAs('ed02', 'mutation AssignRoleToUsers ($roleId: ID!, $userIds: [ID!]!) { assignRoleToUsers (roleId: $roleId, userIds: $userIds) { success } }', { roleId: role.id, userIds: ['ed09'] })).to.be.rejected
  })
  it('should report the assign permission correctly for site owners', async () => {
    const [site1, site3] = await Promise.all([getSiteId('site1'), getSiteId('site3')])
    const [{ role: ownRole }, { role: otherRole }] = await Promise.all([
      createRole({ name: 'assignpermmine', siteId: site1, access: 'CONTRIBUTOR' }),
      createRole({ name: 'assignpermtheirs', siteId: site3, access: 'CONTRIBUTOR' })
    ])
    // ed02 should be able to assign roles for site1 but not for site3
    const { roles } = await queryAs('ed02', `{ roles (filter: { ids: [${ownRole.id}, ${otherRole.id}] }) { id permissions { assign } } }`)
    expect(roles).to.have.lengthOf(2)
    expect(roles.find((r: any) => r.id === ownRole.id).permissions.assign).to.be.true
    expect(roles.find((r: any) => r.id === otherRole.id).permissions.assign).to.be.false
  })
})
