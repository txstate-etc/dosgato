import { expect } from 'chai'
import { query } from '../common'

describe('groups', () => {
  it('should retrieve all groups', async () => {
    const resp = await query('{ groups { id name } }')
    expect(resp.data.groups.length).to.equal(5)
  })
  it('should retrieve direct members of all groups', async () => {
    const resp = await query('{ groups { id name users(direct: true) { id name } } }')
    const group1 = resp.data.groups.find((g: any) => g.name === 'group1')
    expect(group1.users.length).to.equal(3)
  })
  it('should retrieve indirect members of all groups', async () => {
    const resp = await query('{ groups { id name users(direct: false) { id name } } }')
    const group1 = resp.data.groups.find((g: any) => g.name === 'group1')
    expect(group1.users.length).to.equal(4)
    const group3 = resp.data.groups.find((g: any) => g.name === 'group3')
    expect(group3.users.length).to.equal(0)
  })
  it('should retrieve group and subgroup users for all groups', async () => {
    const resp = await query('{ groups { id name users { id name } } }')
    const group1 = resp.data.groups.find((g: any) => g.name === 'group1')
    expect(group1.users.length).to.equal(5)
  })
  it('should retrieve direct subgroups', async () => {
    const resp = await query('{ groups { id name subgroups(recursive: false) { id name } } }')
    const group1 = resp.data.groups.find((g: any) => g.name === 'group1')
    expect(group1.subgroups.length).to.equal(2)
    const group3 = resp.data.groups.find((g: any) => g.name === 'group3')
    expect(group3.subgroups.length).to.equal(0)
  })
  it('should retrieve subgroups recursively', async () => {
    const resp = await query('{ groups { id name subgroups(recursive: true) { id name } } }')
    const group1 = resp.data.groups.find((g: any) => g.name === 'group1')
    expect(group1.subgroups.length).to.equal(3)
  })
})
