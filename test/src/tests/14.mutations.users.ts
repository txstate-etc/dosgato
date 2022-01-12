/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common'

describe('users mutations', () => {
  it('should update a user\'s name', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: String!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id name } } }', { id: 'ed10', input: { name: 'Updated Username' } })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id name } }')
    expect(users).to.deep.include({ id: 'ed10', name: 'Updated Username' })
  })
  it('should update a user\'s email', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: String!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id name email } } }', { id: 'ed10', input: { email: 'ed10alias@example.com' } })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id name email } }')
    expect(users).to.deep.include({ id: 'ed10', name: 'Updated Username', email: 'ed10alias@example.com' })
  })
  it('should not update a non-existent user', async () => {
    await query('mutation UpdateUser ($id: String!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id name } } }', { id: 'notreal', input: { name: 'Should Notwork' } })
    const { users } = await query('{ users(filter: { enabled: true }) { name } }')
    expect(users).to.not.deep.include({ name: 'Should Notwork' })
  })
  it('should disable a user', async () => {
    const { disableUser: { success } } = await query('mutation DisableUser ($id: String!) { disableUser(userId: $id) { success user { id name } } }', { id: 'ed10' })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id name disabled } }')
    expect(users).to.deep.include({ id: 'ed10', name: 'Updated Username', disabled: true })
    const { roles } = await query('{ roles(filter: { users: ["ed10"] }) { id } }')
    expect(roles).to.have.length(0)
    const { groups } = await query('{ groups { id name users { id } } }')
    const group5 = groups.find((g: any) => g.name === 'group5')
    expect(group5.users).to.not.deep.include({ id: 'ed10' })
    const { sites } = await query('{ sites { name owner { id } managers { id } } }')
    const site2 = sites.find((s: any) => s.name === 'site2')
    const site4 = sites.find((s: any) => s.name === 'site4')
    expect(site2.managers).to.not.deep.include({ id: 'ed10' })
    expect(site4.owner).to.be.null
  })
  it('should not disable a non-existent user', async () => {
    await query('mutation DisableUser ($id: String!) { disableUser(userId: $id) { success user { id name } } }', { id: 'fakeuser' })
    const { users } = await query('{ users(filter: { enabled: false }) { name } }')
    expect(users).to.not.deep.include({ id: 'fakeuser' })
  })
})
