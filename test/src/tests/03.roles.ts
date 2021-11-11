/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('roles', () => {
  it('should retrieve roles by id', async () => {
    const resp1 = await query('{ roles(filter: { users: ["ed06"] }) { id } }')
    const roleIds = resp1.data.roles.map((r: any) => r.id)
    const resp = await query(`{ roles(filter: { ids: [${roleIds.map((id: any) => `"${id}"`).join(',')}] }) { id, name } }`)
    expect(roleIds.length).to.equal(resp.data.roles.length)
    for (const role of resp.data.roles) {
      expect(roleIds).to.include(role.id)
    }
  })
  it('should retrieve roles by user', async () => {
    const resp = await query('{ roles(filter: { users: ["su03"] }) { id name } }')
    expect(resp.data.roles).to.have.lengthOf(2)
    const roles = resp.data.roles.map((r: any) => r.name)
    expect(roles.includes('superuser')).to.be.true
  })
  it('should retrieve a list of users related to a role, both directly and indirectly through a group membership', async () => {
    const resp = await query('{ roles(filter: { users: ["ed01"] }) { id name users { id name } } }')
    const editorRole = resp.data.roles.find((r: any) => r.name === 'editor')
    const users = editorRole.users.map((u: any) => u.id)
    expect(users).to.include.members(['ed01', 'su01'])
  })
  it('should retrieve a list of users related to a role directly', async () => {
    const resp = await query('{ roles(filter: { users: ["ed01"] }) { id name users(direct: true) { id name } } }')
    const editorRole = resp.data.roles.find((r: any) => r.name === 'editor')
    const users = editorRole.users.map((u: any) => u.id)
    expect(users).to.have.members(['ed01', 'su03'])
  })
  it('should retrieve a list of users related to a role indirectly through a group', async () => {
    const resp = await query('{ roles(filter: { users: ["ed01"] }) { id name users(direct: false) { id name } } }')
    const editorRole = resp.data.roles.find((r: any) => r.name === 'editor')
    const users = editorRole.users.map((u: any) => u.id)
    expect(users).to.have.members(['su01', 'ed02'])
  })
  it('should retrieve a list of users related to a role, filtered by a user filter', async () => {
    const resp = await query('{ roles(filter: { users: ["ed01"] }) { id name users(filter: { enabled: true }) { id name } } }')
    const editorRole = resp.data.roles.find((r: any) => r.name === 'editor')
    const users = editorRole.users.map((u: any) => u.id)
    expect(users).to.include.members(['ed01'])
    expect(users).to.not.have.members(['ed02'])
  })
  it('should retrieve a list of groups related to a role, both directly and indirectly through a parent group', async () => {
    const resp = await query('{ roles(filter: { users:["ed05"] }) { id name groups { id name } } }')
    const role = resp.data.roles.find((r: any) => r.name === 'group6role')
    expect(role.groups).to.have.lengthOf(2)
  })
  it('should retrieve a list of groups directly related to a role', async () => {
    const resp = await query('{ roles(filter: { users:["ed05"] }) { id name groups(direct: true) { id name } } }')
    const role = resp.data.roles.find((r: any) => r.name === 'group6role')
    expect(role.groups).to.have.lengthOf(1)
    expect(role.groups[0].name).to.equal('group6')
  })
  it('should retrieve a list of groups indirectly related to a role through a parent group', async () => {
    const resp = await query('{ roles(filter: { users:["ed05"] }) { id name groups(direct: false) { id name } } }')
    const role = resp.data.roles.find((r: any) => r.name === 'group6role')
    expect(role.groups).to.have.lengthOf(1)
    expect(role.groups[0].name).to.equal('group7')
  })
})
