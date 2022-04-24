/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common'

chai.use(chaiAsPromised)

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
    await expect(query('mutation UpdateUser ($id: String!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id name } } }', { id: 'notreal', input: { name: 'Should Notwork' } })).to.be.rejected
    const { users } = await query('{ users(filter: { enabled: true }) { name } }')
    expect(users).to.not.deep.include({ name: 'Should Notwork' })
  })
  it('should not allow an unauthorized user to update a user', async () => {
    await expect(queryAs('ed07', 'mutation UpdateUser ($id: String!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id name } } }', { id: 'ed10', input: { name: 'Updated Username' } })).to.be.rejected
  })
  it('should disable a user', async () => {
    const { disableUser: { success } } = await query('mutation DisableUser ($id: String!) { disableUser(userId: $id) { success user { id name } } }', { id: 'ed10' })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id name disabled } }')
    expect(users).to.deep.include({ id: 'ed10', name: 'Updated Username', disabled: true })
  })
  it('should not disable a non-existent user', async () => {
    await expect(query('mutation DisableUser ($id: String!) { disableUser(userId: $id) { success user { id name } } }', { id: 'fakeuser' })).to.be.rejected
    const { users } = await query('{ users(filter: { enabled: false }) { name } }')
    expect(users).to.not.deep.include({ id: 'fakeuser' })
  })
  it('should not allow an unauthorized user to disable a user', async () => {
    await expect(queryAs('ed07', 'mutation DisableUser ($id: String!) { disableUser(userId: $id) { success user { id name } } }', { id: 'su01' })).to.be.rejected
  })
})
