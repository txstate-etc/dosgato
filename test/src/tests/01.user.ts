/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('users', () => {
  before(async function () {
    this.timeout(10000)
    let success = false
    while (!success) {
      try {
        await query('{ users(filter: { ids: ["self"] }) { id, firstname, lastname, email } }')
        success = true
      } catch (e: any) {
        // keep trying
      }
    }
  })

  it('should return the logged in user', async () => {
    const { users } = await query('{ users(filter: { ids: ["self"] }) { id, firstname, lastname, email } }')
    expect(users.length).to.equal(1)
    expect(users).to.deep.include({ id: 'su01', firstname: 'Michael', lastname: 'Scott', email: 'su01@example.com' })
  })
  it('should retrieve users by netid', async () => {
    const { users } = await query('{ users(filter: { ids: ["su01", "ed01"] }) { id, firstname, lastname, email } }')
    expect(users).to.have.lengthOf(2)
  })
  it('should retrieve users who are disabled in the system', async () => {
    const { users } = await query('{ users(filter: { enabled: false }) { id, firstname, lastname, email } }')
    const found = users.some((user: any) => {
      return user.id === 'ed08'
    })
    expect(found).to.be.true
  })
  it('should retrieve users who are enabled in the system', async () => {
    const { users } = await query('{ users(filter: { enabled: true }) { id, firstname, lastname, email } }')
    expect(users.length).to.be.greaterThan(0)
    const found = users.some((user: any) => {
      return user.id === 'ed08'
    })
    expect(found).to.be.false
  })
  it('should retrieve trained users', async () => {
    const { users } = await query('{ users(filter: { trained: true }) { id, firstname, lastname, trained } }')
    for (const user of users) {
      expect(user.trained).to.be.true
    }
    const found = users.some((user: any) => {
      return user.id === 'ed04'
    })
    expect(found).to.be.false
  })
  it('should retrieve untrained users', async () => {
    const { users } = await query('{ users(filter: { trained: false }) { id, firstname, lastname, trained } }')
    for (const user of users) {
      expect(user.trained).to.be.false
    }
    const found = users.some((user: any) => {
      return user.id === 'ed04'
    })
    expect(found).to.be.true
  })
  it('should retrieve a user\'s groups, direct and indirect', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id firstname lastname groups{ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
  })
  it('should retrieve a user\'s direct groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["su03"] }) { id firstname lastname groups(direct: true){ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
    const groups = users[0].groups.map((gr: { id: number, name: string }) => gr.name)
    expect(groups).to.have.members(['group4', 'group1'])
  })
  it('should retrieve a user\'s indirect groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["ed02"] }) { id firstname lastname groups(direct: false){ id name } } }')
    expect(users[0].groups).to.have.lengthOf(2)
    const groups = users[0].groups.map((gr: { id: number, name: string }) => gr.name)
    expect(groups).to.have.members(['group2', 'group1'])
  })
  it('should retrieve a user\'s roles, both direct and through their groups', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id firstname lastname roles { id name } } }')
    expect(users[0].roles).to.have.lengthOf(2)
    const roles = users[0].roles.map((role: any) => role.name)
    expect(roles).to.have.members(['superuser', 'site3-editor'])
  })
  it('should retrieve a user\'s direct roles', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id firstname lastname roles(direct: true) { id name } } }')
    expect(users[0].roles).to.have.lengthOf(1)
    expect(users[0].roles[0].name).to.equal('superuser')
  })
  it('should retrieve a user\'s indirect roles', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id firstname lastname roles(direct: false) { id name } } }')
    expect(users[0].roles).to.have.lengthOf(1)
    expect(users[0].roles[0].name).to.equal('site3-editor')
  })
  it('should retrieve the sites a user owns', async () => {
    const { users } = await query('{ users(filter: { ids: ["su01"] }) { id firstname lastname sitesOwned { name } } }')
    expect(users[0].sitesOwned.map((s: any) => s.name)).to.include.members(['site2', 'site5', 'site7'])
  })
  it('should retrieve the sites a user manages', async () => {
    const { users } = await query('{ users(filter: { ids: ["su02"] }) { id firstname lastname sitesManaged { name } } }')
    expect(users[0].sitesManaged.map((s: any) => s.name)).to.include.members(['site2'])
  })
})
