/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'

chai.use(chaiAsPromised)

async function createUser (id: string, firstname: string | undefined, lastname: string, email: string, trainings: string[], system: boolean) {
  const { createUser: { success, user, messages } } = await query(`
      mutation CreateUser ($userId: ID!, $firstname: String, $lastname: String!, $email: String!, $trainings: [ID!]!, $system: Boolean!, $validateOnly: Boolean) {
        createUser (userId: $userId, firstname: $firstname, lastname: $lastname, email: $email, trainings: $trainings, system: $system, validateOnly: $validateOnly) {
          success
          user { id }
          messages { message }
        }
      }`, { userId: id, firstname, lastname, email, trainings, system })
  return { success, user, messages }
}

describe('users mutations', () => {
  it('should create a user', async () => {
    const { user, success } = await createUser('newuser1', 'New', 'User-One', 'newuser1@email.com', [], false)
    expect(success).to.be.true
    expect(user?.id).to.equal('newuser1')
  })
  it('should create a system user with no first name', async () => {
    const { success } = await createUser('systemuser1', undefined, 'System-One', 'systemuser1@email.com', [], true)
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { system: true }) { id } }')
    expect(users).to.deep.include({ id: 'systemuser1' })
  })
  it('should update a user\'s name', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname } } }', { id: 'ed10', input: { firstname: 'Updated', lastname: 'Username', email: 'ed10@example.com' } })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { ids: ["ed10"]}) { id firstname lastname } }')
    expect(users).to.deep.include({ id: 'ed10', firstname: 'Updated', lastname: 'Username' })
  })
  it('should update a user\'s email', async () => {
    const { updateUser: { success } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname email } } }', { id: 'ed10', input: { firstname: 'Updated', lastname: 'Username', email: 'ed10alias@example.com' } })
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
  it('should set the trainings for a user', async () => {
    const { updateUser: { success, user } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname trainings { id name } } } }', { id: 'ed04', input: { firstname: 'Katniss', lastname: 'Everdeen', email: 'ed04@example.com', trainings: ['1'] } })
    expect(success).to.be.true
    expect(user.trainings.length).to.be.greaterThan(0)
    const { users } = await query('{ users(filter: { trainingAny: ["1"] }) { id } }')
    expect(users.map((u: any) => u.id)).to.include.members(['ed04'])
  })
  it('should unset the trainings for a user', async () => {
    const { updateUser: { success, user } } = await query('mutation UpdateUser ($id: ID!, $input: UpdateUserInput!) { updateUser (userId: $id, args: $input) { success user { id firstname lastname trainings { id name } } } }', { id: 'ed04', input: { firstname: 'Katniss', lastname: 'Everdeen', email: 'ed04@example.com', trainings: [] } })
    expect(success).to.be.true
    expect(user.trainings.length).to.equal(0)
    const { users } = await query('{ users(filter: { trainingAny: ["1"] }) { id } }')
    expect(users.map((u: any) => u.id)).not.to.include.members(['ed04'])
  })
  it('should add a training to multiple users', async () => {
    const { updateTraining: { success } } = await query('mutation addTrainings ($trainingId: ID!, $userIds: [ID!]!) { updateTraining (trainingId: $trainingId, userIds: $userIds) { success } }', { trainingId: '1', userIds: ['ed03', 'ed04'] })
    expect(success).to.be.true
    const { users } = await query('{ users(filter: { trainingAny: ["1"] }) { id } }')
    expect(users.map((u: any) => u.id)).to.include.members(['ed03', 'ed04'])
  })
})
