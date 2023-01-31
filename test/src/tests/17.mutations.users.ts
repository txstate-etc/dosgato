/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'

chai.use(chaiAsPromised)

describe('users mutations', () => {
  it('should update a user\'s name', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname } } }', { id: 'ed10', input: { firstname: 'Updated', lastname: 'Username', email: 'ed10@example.com', trained: false } })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id firstname lastname } }')
    expect(users).to.deep.include({ id: 'ed10', firstname: 'Updated', lastname: 'Username' })
  })
  it('should update a user\'s email', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname email } } }', { id: 'ed10', input: { firstname: 'Updated', lastname: 'Username', email: 'ed10alias@example.com', trained: false } })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id firstname lastname email } }')
    expect(users).to.deep.include({ id: 'ed10', firstname: 'Updated', lastname: 'Username', email: 'ed10alias@example.com' })
  })
  it('should not update a non-existent user', async () => {
    await expect(query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname } } }', { id: 'notreal', input: { firstname: 'Should', lastname: 'Notwork' } })).to.be.rejected
    const { users } = await query('{ users(filter: { enabled: true }) { firstname lastname } }')
    expect(users).to.not.deep.include({ firstname: 'Should', lastname: 'Notwork' })
  })
  it('should not allow an unauthorized user to update a user', async () => {
    await expect(queryAs('ed07', 'mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname } } }', { id: 'ed10', input: { firstname: 'Updated', lastname: 'Username' } })).to.be.rejected
  })
  it('should disable a user', async () => {
    const { disableUsers: { success } } = await query('mutation DisableUsers ($ids: [ID!]!) { disableUsers(userIds: $ids) { success users { id firstname lastname } } }', { ids: ['ed10'] })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id firstname lastname disabled } }')
    expect(users).to.deep.include({ id: 'ed10', firstname: 'Updated', lastname: 'Username', disabled: true })
  })
  it('should not disable a non-existent user', async () => {
    await query('mutation DisableUsers ($ids: [ID!]!) { disableUsers(userIds: $ids) { success users { id firstname lastname } } }', { ids: ['fakeuser'] })
    const { users } = await query('{ users(filter: { enabled: false }) { id } }')
    expect(users).to.not.deep.include({ id: 'fakeuser' })
  })
  it('should not allow an unauthorized user to disable a user', async () => {
    await expect(queryAs('ed07', 'mutation DisableUsers ($ids: [ID!]!) { disableUsers(userIds: $ids) { success users { id firstname lastname } } }', { ids: ['su01'] })).to.be.rejected
  })
  it('should set the trained flag for a user', async () => {
    const { updateUser: { success, user } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname trained } } }', { id: 'ed04', input: { firstname: 'Katniss', lastname: 'Everdeen', email: 'ed04@example.com', trained: true } })
    expect(success).to.be.true
    expect(user.trained).to.be.true
    const { users } = await query('{ users(filter: { trained: true }) { id } }')
    expect(users.map((u: any) => u.id)).to.include.members(['ed04'])
  })
})
