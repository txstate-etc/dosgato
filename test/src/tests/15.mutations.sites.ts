/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createSite (name: string, username?: string) {
  const { createSite: { success, site, messages } } = await queryAs((username ?? 'su01'), 'mutation CreateSite ($args: CreateSiteInput!) { createSite (args: $args) { success messages { message } site { id name } } }', { args: { name, rootPageTemplateKey: 'keyp1', schemaVersion: DateTime.utc() } })
  return { success, site, messages }
}

describe('sites mutations', () => {
  it('should create a site', async () => {
    const { success, site } = await createSite('newsiteA')
    expect(success).to.be.true
    expect(site.name).to.equal('newsiteA')
    const { pages } = await query(`{ pages(filter: { siteIds: [${site.id}] }) { id name } }`)
    expect(pages[0].name).to.equal('newsiteA')
    const { sites } = await query('{ sites { name assetroot { name } } }')
    const newSite = sites.find((s: any) => s.name === 'newsiteA')
    expect(newSite.assetroot.name).to.equal('newsiteA')
  })
  it('should not allow a duplicate site name', async () => {
    const { success, messages } = await createSite('site1')
    expect(success).to.be.false
    expect(messages).to.have.length.greaterThan(0)
  })
  it('should not allow an unauthorized user to create a site', async () => {
    await expect(createSite('newsiteB', 'ed07')).to.be.rejected
  })
  it('should update a site name', async () => {
    const { site: siteC } = await createSite('newsiteC')
    const { updateSite: { success, site } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name } } }', { id: siteC.id, args: { name: 'updatedSiteC' } })
    expect(success).to.be.true
    expect(site.name).to.equal('updatedSiteC')
  })
  it('should not allow an unauthorized user to update a site name', async () => {
    const { site: siteD } = await createSite('newsiteD')
    await expect(queryAs('ed07', 'mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name } } }', { id: siteD.id, args: { name: 'updatedSiteD' } })).to.be.rejected
  })
  it('should add a site owner to a site', async () => {
    const { site: siteE } = await createSite('newsiteE')
    const { updateSite: { success } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name owner { id } } } }', { id: siteE.id, args: { ownerId: 'ed07' } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteE.id}] }) { name owner { id } } }`)
    expect(sites[0].owner.id).to.equal('ed07')
  })
  it('should add an organization to a site', async () => {
    const { site: siteF } = await createSite('newsiteF')
    const { organizations } = await query('{ organizations { id name } }')
    const { updateSite: { success } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success site { name organization { name } } } }', { id: siteF.id, args: { organizationId: organizations[0].id } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteF.id}] }) { name organization { name } } }`)
    expect(sites[0].organization.name).to.equal(organizations[0].name)
  })
  it('should add managers to a site', async () => {
    const { site: siteG } = await createSite('newsiteG')
    const { updateSite: { success } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success } }', { id: siteG.id, args: { managerIds: ['ed01', 'ed02', 'ed03', 'ed04'] } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteG.id}] }) { name managers { id } } }`)
    expect(sites[0].managers.map((m: any) => m.id)).to.have.members(['ed01', 'ed02', 'ed03', 'ed04'])
  })
  it('should add a launch URL to a site', async () => {
    const { site: siteH } = await createSite('newsiteH')
    const { updateSite: { success } } = await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success } }', { id: siteH.id, args: { launchHost: 'www.example.com', launchPath: '/departmentH/' } })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteH.id}] }) { launched url { host path prefix } } }`)
    expect(sites[0].launched).to.be.true
    expect(sites[0].url.host).to.equal('www.example.com')
    expect(sites[0].url.path).to.equal('/departmentH/')
    expect(sites[0].url.prefix).to.equal('https://www.example.com/departmentH/')
  })
  it('should delete a site', async () => {
    const { site: siteI } = await createSite('newsiteI')
    const { deleteSite: { success } } = await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteI.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteI.id}] }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.not.be.null
  })
  it('should not allow an unauthorized user to delete a site', async () => {
    await expect(queryAs('ed07', 'mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
  it('should undelete a site', async () => {
    const { site: siteJ } = await createSite('newsiteJ')
    await query('mutation DeleteSite ($id: ID!) { deleteSite (siteId: $id) { success } }', { id: siteJ.id })
    const { undeleteSite: { success } } = await query('mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success  } }', { id: siteJ.id })
    expect(success).to.be.true
    const { sites } = await query(`{ sites(filter: { ids: [${siteJ.id}] }) { name deletedAt } }`)
    expect(sites[0].deletedAt).to.be.null
  })
  it('should not allow an unauthorized user to undelete a site', async () => {
    await expect(queryAs('ed07', 'mutation UndeleteSite ($id: ID!) { undeleteSite (siteId: $id) { success } }', { id: 1 })).to.be.rejected
  })
  it('should allow a site manager to manage group membership of a group associated with the site', async () => {
    const { site: siteK } = await createSite('newsiteK')
    await query('mutation UpdateSite ($id: ID!, $args: UpdateSiteInput!) { updateSite (siteId:$id, args: $args) { success } }', { id: siteK.id, args: { managerIds: ['ed09'] } })
    const { createGroup: { group } } = await query('mutation CreateGroup ($name: String!) { createGroup (name: $name) { group { id name } } }', { name: 'siteKGroup' })
    await query('mutation AddGroupSite ($groupId: ID!, $siteId: ID!) { addGroupSite (groupId: $groupId, siteId: $siteId) { success } }', { groupId: group.id, siteId: siteK.id })
    const { groups } = await query(`{ groups(filter: { ids: [${group.id}] }) { name managers { id } } }`)
    expect(groups[0].managers[0].id).to.equal('ed09')
    const { addUserToGroups: { success } } = await queryAs('ed09', 'mutation AddUserToGroups ($groupIds: [ID!]!, $userId: ID!) { addUserToGroups (groupIds: $groupIds, userId: $userId) { success } }', { groupIds: [group.id], userId: 'su03' })
    expect(success).to.be.true
  })
})
