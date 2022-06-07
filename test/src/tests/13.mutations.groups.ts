/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createGroup (name: string, username?: string) {
  const { createGroup: { success, group, messages } } = await queryAs((username ?? 'su01'), 'mutation CreateGroup ($name: String!) { createGroup (name: $name) { success messages { message } group { id name } } }', { name })
  return { success, group, messages }
}
describe('groups mutations', () => {
  it('should create a new group', async () => {
    const { success, group } = await createGroup('groupA')
    expect(success).to.be.true
    expect(group.name).to.equal('groupA')
  })
  it('should return an error when trying to add a new group with an existing name', async () => {
    const { success, messages } = await createGroup('group1')
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a group', async () => {
    await expect(createGroup('doesnotmatter', 'ed07')).to.be.rejected
  })
  it('should update a group name', async () => {
    const { group: groupB } = await createGroup('groupB')
    const { updateGroup: { success } } = await query('mutation UpdateGroup ($groupId: ID!, $name: String!) { updateGroup (groupId: $groupId, name: $name) { success group { id name } } }', { groupId: groupB.id, name: 'groupBUpdated' })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name } }')
    const groupNames = groups.map((g: any) => g.name)
    expect(groupNames).to.include('groupBUpdated')
    expect(groupNames).to.not.include('groupB')
  })
  it('should not allow an unauthorized user to updage a group name', async () => {
    const { group: groupBB } = await createGroup('groupBB')
    await expect(queryAs('ed07', 'mutation UpdateGroup ($groupId: ID!, $name: String!) { updateGroup (groupId: $groupId, name: $name) { success group { id name } } }', { groupId: groupBB.id, name: 'groupBBUpdated' })).to.be.rejected
  })
  it('should not update a group name if the new group name already exists', async () => {
    const { group: groupC } = await createGroup('groupC')
    const { updateGroup: { success, messages } } = await query('mutation UpdateGroup ($groupId: ID!, $name: String!) { updateGroup (groupId: $groupId, name: $name) { success messages { message } } }', { groupId: groupC.id, name: 'group1' })
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should delete a group', async () => {
    const { group: deleteMe } = await createGroup('deleteMe')
    const { deleteGroup: { success } } = await query('mutation DeleteGroup ($groupId: ID!) { deleteGroup (groupId: $groupId) { success } }', { groupId: deleteMe.id })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name } }')
    expect(groups.map((g: any) => g.name)).to.not.include('deleteMe')
  })
  it('should not allow an unauthorized user to delete a group', async () => {
    const { group: deleteMe } = await createGroup('deleteMe')
    await expect(queryAs('ed07', 'mutation DeleteGroup ($groupId: ID!) { deleteGroup (groupId: $groupId) { success } }', { groupId: deleteMe.id })).to.be.rejected
  })
  it('should add a user to a group', async () => {
    const { group: groupD } = await createGroup('groupD')
    const { addUserToGroups: { success } } = await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupD.id], userId: 'su03' })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name users { id name } } }')
    const group = groups.find((g: any) => g.id === groupD.id)
    expect(group.users.map((g: any) => g.id)).to.include('su03')
  })
  it('should not add a non-existent user to a group', async () => {
    const { group: groupE } = await createGroup('groupE')
    await expect(query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: [$groupId], userId: $userId) { success } }', { groupIds: [groupE.id], userId: 'fake' })).to.be.rejected
    const { groups } = await query('{ groups { id name users { id name } } }')
    const group = groups.find((g: any) => g.id === groupE.id)
    expect(group.users).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to add a user to a group', async () => {
    const { group: groupDD } = await createGroup('groupDD')
    await expect(queryAs('ed07', 'mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupDD.id], userId: 'su03' })).to.be.rejected
  })
  it('should remove a user from a group', async () => {
    const { group: groupF } = await createGroup('groupF')
    const { addUserToGroups: { success: addSuccess } } = await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupF.id], userId: 'ed01' })
    expect(addSuccess).to.be.true
    const { removeUserFromGroups: { success } } = await query('mutation RemoveUserFromGroups ($groupIds: [ID!]!, $userId: ID!) { removeUserFromGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupF.id], userId: 'ed01' })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name users { id name } } }')
    const group = groups.find((g: any) => g.id === groupF.id)
    expect(group.users).to.have.lengthOf(0)
  })
  it('should not allow an unauthorized user to remove a user from a group', async () => {
    const { group: groupFF } = await createGroup('groupFF')
    await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupFF.id], userId: 'ed01' })
    await expect(queryAs('ed07', 'mutation removeUserFromGroups ($groupIds: [ID!]!, $userId: ID!) { removeUserFromGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupFF.id], userId: 'ed01' })).to.be.rejected
  })
  it('should add a group manager', async () => {
    const { group: groupH } = await createGroup('groupH')
    await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupH.id], userId: 'ed01' })
    const { setGroupManager: { success } } = await query('mutation SetGroupManager ($groupId: ID!, $userId: ID!, $manager: Boolean!) { setGroupManager (groupId: $groupId, userId: $userId, manager: $manager) { success } }', { groupId: groupH.id, userId: 'ed01', manager: true })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name managers { id } } }')
    const group = groups.find((g: any) => g.id === groupH.id)
    expect(group.managers).to.deep.include({ id: 'ed01' })
  })
  it('should not allow an unauthorized user to add a group manager', async () => {
    const { group: groupHH } = await createGroup('groupHH')
    await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupHH.id], userId: 'ed01' })
    await expect(queryAs('ed07', 'mutation SetGroupManager ($groupId: ID!, $userId: ID!, $manager: Boolean!) { setGroupManager (groupId: $groupId, userId: $userId, manager: $manager) { success } }', { groupId: groupHH.id, userId: 'ed01', manager: true })).to.be.rejected
  })
  it('should remove a group manager', async () => {
    const { group: groupI } = await createGroup('groupI')
    await query('mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [groupI.id], userId: 'ed01' })
    await query('mutation SetGroupManager ($groupId: ID!, $userId: ID!, $manager: Boolean!) { setGroupManager (groupId: $groupId, userId: $userId, manager: $manager) { success } }', { groupId: groupI.id, userId: 'ed01', manager: true })
    const { setGroupManager: { success } } = await query('mutation SetGroupManager ($groupId: ID!, $userId: ID!, $manager: Boolean!) { setGroupManager (groupId: $groupId, userId: $userId, manager: $manager) { success } }', { groupId: groupI.id, userId: 'ed01', manager: false })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name managers { id } } }')
    const group = groups.find((g: any) => g.id === groupI.id)
    expect(group.managers).to.have.lengthOf(0)
  })
  it('should add a role to a group', async () => {
    const { roles } = await query('{ roles(filter: { ids: [2] }) { id name } }')
    const { group: groupJ } = await createGroup('groupJ')
    const { addRoleToGroup: { success } } = await query('mutation AddRoleToGroup ($groupId: ID!, $roleId: ID!) { addRoleToGroup (groupId: $groupId, roleId: $roleId) { success } }', { groupId: groupJ.id, roleId: roles[0].id })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name roles { id } } }')
    const group = groups.find((g: any) => g.id === groupJ.id)
    expect(group.roles).to.deep.include({ id: roles[0].id })
  })
  it('should not allow an unauthorized user to add a role to a group', async () => {
    const { roles } = await query('{ roles(filter: { ids: [2] }) { id name } }')
    const { group: groupJJ } = await createGroup('groupJJ')
    await expect(queryAs('ed07', 'mutation AddRoleToGroup ($groupId: ID!, $roleId: ID!) { addRoleToGroup (groupId: $groupId, roleId: $roleId) { success } }', { groupId: groupJJ.id, roleId: roles[0].id })).to.be.rejected
  })
  it('should remove a role from a group', async () => {
    const { roles } = await query('{ roles(filter: { ids: [2] }) { id name } }')
    const { group: groupK } = await createGroup('groupK')
    await query('mutation AddRoleToGroup ($groupId: ID!, $roleId: ID!) { addRoleToGroup (groupId: $groupId, roleId: $roleId) { success } }', { groupId: groupK.id, roleId: roles[0].id })
    const { removeRoleFromGroup: { success } } = await query('mutation RemoveRoleFromGroup ($groupId: ID!, $roleId: ID!) { removeRoleFromGroup (groupId: $groupId, roleId: $roleId) {success } }', { groupId: groupK.id, roleId: roles[0].id })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name roles { id } } }')
    const group = groups.find((g: any) => g.id === groupK.id)
    expect(group.roles).to.have.lengthOf(0)
  })
  it('should not remove a role from a group if that role is not assigned to the group', async () => {
    const { group: groupL } = await createGroup('groupL')
    const { removeRoleFromGroup: { success } } = await query('mutation RemoveRoleFromGroup ($groupId: ID!, $roleId: ID!) { removeRoleFromGroup (groupId: $groupId, roleId: $roleId) {success } }', { groupId: groupL.id, roleId: '3' })
    expect(success).to.be.false
  })
  it('should add a subgroup to a group', async () => {
    const { group: groupM } = await createGroup('groupM')
    const { group: groupN } = await createGroup('groupN')
    const { addSubgroup: { success } } = await query('mutation AddSubgroup ($parentGroupId: ID!, $childGroupId: ID!) { addSubgroup (parentGroupId: $parentGroupId, childGroupId: $childGroupId) { success } }', { parentGroupId: groupM.id, childGroupId: groupN.id })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name subgroups { id } } }')
    const group = groups.find((g: any) => g.id === groupM.id)
    expect(group.subgroups).to.deep.include({ id: groupN.id })
  })
  it('should not allow an unauthorized user to add a subgroup to a group', async () => {
    const { group: groupMM } = await createGroup('groupMM')
    const { group: groupNN } = await createGroup('groupNN')
    await expect(queryAs('ed07', 'mutation AddSubgroup ($parentGroupId: ID!, $childGroupId: ID!) { addSubgroup (parentGroupId: $parentGroupId, childGroupId: $childGroupId) { success } }', { parentGroupId: groupMM.id, childGroupId: groupNN.id })).to.be.rejected
  })
  it('should remove a subgroup from a group', async () => {
    const { group: groupO } = await createGroup('groupO')
    const { group: groupP } = await createGroup('groupP')
    await query('mutation AddSubgroup ($parentGroupId: ID!, $childGroupId: ID!) { addSubgroup (parentGroupId: $parentGroupId, childGroupId: $childGroupId) { success } }', { parentGroupId: groupO.id, childGroupId: groupP.id })
    const { removeSubgroup: { success } } = await query('mutation RemoveSubgroup ($parentGroupId: ID!, $childGroupId: ID!) { removeSubgroup (parentGroupId: $parentGroupId, childGroupId: $childGroupId) { success } }', { parentGroupId: groupO.id, childGroupId: groupP.id })
    expect(success).to.be.true
    const { groups } = await query('{ groups { id name subgroups { id } } }')
    const group = groups.find((g: any) => g.id === groupO.id)
    expect(group.subgroups).to.have.lengthOf(0)
  })
  it('should not remove a subgroup from a group if it is not a subgroup of that group', async () => {
    const { group: groupQ } = await createGroup('groupQ')
    const { removeSubgroup: { success } } = await query('mutation RemoveSubgroup ($parentGroupId: ID!, $childGroupId: ID!) { removeSubgroup (parentGroupId: $parentGroupId, childGroupId: $childGroupId) { success } }', { parentGroupId: groupQ.id, childGroupId: '3' })
    expect(success).to.be.false
  })
  it('should associate a site with a group', async () => {
    const { group: groupR } = await createGroup('groupR')
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'testgroupsiterelationship1', rootPageTemplateKey: 'keyp1', schemaVersion: DateTime.utc() } })
    const { addGroupSite: { success } } = await query('mutation AddGroupSite ($groupId: ID!, $siteId: ID!) { addGroupSite (groupId: $groupId, siteId: $siteId) { success } }', { groupId: groupR.id, siteId: site.id })
    expect(success).to.be.true
    const { groups } = await query(`{ groups(filter: { ids: [${groupR.id}] }) { sites { id name } } }`)
    expect(groups[0].sites[0].name).to.equal('testgroupsiterelationship1')
  })
  it('should remove the association between a site and a group', async () => {
    const { group: groupS } = await createGroup('groupS')
    const { createSite: { site } } = await query('mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success site { id name } } }', { args: { name: 'testgroupsiterelationship2', rootPageTemplateKey: 'keyp1', schemaVersion: DateTime.utc() } })
    await query('mutation AddGroupSite ($groupId: ID!, $siteId: ID!) { addGroupSite (groupId: $groupId, siteId: $siteId) { success } }', { groupId: groupS.id, siteId: site.id })
    const { removeGroupSite: { success } } = await query('mutation RemoveGroupSite ($groupId: ID!, $siteId: ID!) { removeGroupSite (groupId: $groupId, siteId: $siteId) { success } }', { groupId: groupS.id, siteId: site.id })
    expect(success).to.be.true
    const { groups } = await query(`{ groups(filter: { ids: [${groupS.id}] }) { sites { id name } } }`)
    expect(groups[0].sites.length).to.equal(0)
  })
})
