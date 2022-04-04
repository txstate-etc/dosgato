/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import jwt from 'jsonwebtoken'
import { query } from '../common'

describe('users', () => {
  before(async () => {
    console.log(jwt.sign({ sub: 'su01' }, process.env.JWT_SECRET ?? ''))
    let success = false
    while (!success) {
      try {
        await query('{ users(filter: { ids: ["self"] }) { id, name, email } }')
        success = true
      } catch (e: any) {
        // keep trying
      }
    }
  })

  it('should return the logged in user', async () => {
    const { users } = await query('{ users(filter: { ids: ["self"] }) { id, name, email } }')
    expect(users.length).to.equal(1)
    expect(users).to.deep.include({ id: 'su01', name: 'Michael Scott', email: 'su01@example.com' })
  })
  it('should retrieve users by netid', async () => {
    const { users } = await query('{ users(filter: { ids: ["su01", "ed01"] }) { id, name, email } }')
    expect(users).to.have.lengthOf(2)
  })
  it('should retrieve users who are disabled in the system', async () => {
    const { users } = await query('{ users(filter: { enabled: false }) { id, name, email } }')
    const found = users.some((user: any) => {
      return user.id === 'ed08'
    })
    expect(found).to.be.true
  })
  it('should retrieve users who are enabled in the system', async () => {
    const { users } = await query('{ users(filter: { enabled: true }) { id, name, email } }')
    expect(users.length).to.be.greaterThan(0)
    const found = users.some((user: any) => {
      return user.id === 'ed08'
    })
    expect(found).to.be.false
  })
  it('should retrieve a user\'s groups, direct and indirect', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id name groups{ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
  })
  it('should retrieve a user\'s direct groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["su03"] }) { id name groups(direct: true){ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
    const groups = users[0].groups.map((gr: { id: number, name: string }) => gr.name)
    expect(groups).to.have.members(['group4', 'group1'])
  })
  it('should retrieve a user\'s indirect groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["ed02"] }) { id name groups(direct: false){ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
    const groups = users[0].groups.map((gr: { id: number, name: string }) => gr.name)
    expect(groups).to.have.members(['group2', 'group1'])
  })
  it('should retrieve a user\'s roles, both direct and through their groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id name roles { id name } } }')
    expect(users[0].roles).to.have.lengthOf(2)
    const roles = users[0].roles.map((role: any) => role.name)
    expect(roles).to.have.members(['superuser', 'site3-editor'])
  })
  it('should retrieve a user\'s direct roles', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id name roles(direct: true) { id name } } }')
    expect(users[0].roles).to.have.lengthOf(1)
    expect(users[0].roles[0].name).to.equal('superuser')
  })
  it('should retrieve a user\'s indirect roles', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id name roles(direct: false) { id name } } }')
    expect(users[0].roles).to.have.lengthOf(1)
    expect(users[0].roles[0].name).to.equal('site3-editor')
  })
})
