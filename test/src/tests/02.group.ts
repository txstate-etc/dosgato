/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'

describe('groups', () => {
  it('should retrieve all groups', async () => {
    const resp = await query('{ groups { id name } }')
    expect(resp.groups).to.have.lengthOf(7)
  })
  it('should retrieve direct members of all groups', async () => {
    const resp = await query('{ groups { id name users(direct: true) { id firstname lastname } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.users).to.have.lengthOf(3)
  })
  it('should retrieve indirect members of all groups', async () => {
    const resp = await query('{ groups { id name users(direct: false) { id firstname lastname } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.users).to.have.lengthOf(4)
    const group3 = resp.groups.find((g: any) => g.name === 'group3')
    expect(group3.users).to.have.lengthOf(0)
  })
  it('should retrieve group and subgroup users for all groups', async () => {
    const resp = await query('{ groups { id name users { id firstname lastname } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.users).to.have.lengthOf(5)
  })
  it('should retrieve direct subgroups', async () => {
    const resp = await query('{ groups { id name subgroups(recursive: false) { id name } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.subgroups).to.have.lengthOf(2)
    const group3 = resp.groups.find((g: any) => g.name === 'group3')
    expect(group3.subgroups).to.have.lengthOf(0)
  })
  it('should retrieve subgroups recursively', async () => {
    const resp = await query('{ groups { id name subgroups(recursive: true) { id name } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.subgroups).to.have.lengthOf(3)
  })
  it('should retrieve roles directly assigned to groups', async () => {
    const resp = await query('{ groups { id name roles(direct: true) { id name } } }')
    const group1 = resp.groups.find((g: any) => g.name === 'group1')
    expect(group1.roles[0].name).to.equal('site3-editor')
  })
  it('should retrieve roles a group has through a parent group', async () => {
    const resp = await query('{ groups { id name roles(direct: false) { id name } } }')
    const group4 = resp.groups.find((g: any) => g.name === 'group4')
    expect(group4.roles[0].name).to.equal('site3-editor')
  })
  it('should retrieve all roles for a group', async () => {
    const resp = await query('{ groups { id name roles { id name } } }')
    const group3 = resp.groups.find((g: any) => g.name === 'group3')
    const roles = group3.roles.map((r: any) => r.name)
    expect(roles).to.have.lengthOf(3)
    expect(roles.includes('site3-editor')).to.be.true
    expect(roles.includes('site2-editor')).to.be.true
    expect(roles.includes('editor')).to.be.true
  })
  it('should retrive a group\'s parent group', async () => {
    const { groups } = await query('{ groups { id name supergroups(recursive: false) { name } } }')
    const group4 = groups.find((g: any) => g.name === 'group4')
    expect(group4.supergroups.map((p: any) => p.name)).to.include('group2')
    const group5 = groups.find((g: any) => g.name === 'group5')
    expect(group5.supergroups.length).to.equal(0)
  })
})
