import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'

use(chaiAsPromised)

interface TeamRole { id: string, name: string, access: string }

let dashboardSiteId: string
let site1Id: string
let dashboardRoles: TeamRole[]
let otherSiteRoleId: string
const trainedUser = 'teammember1'
const untrainedUser = 'teammember2'
const contributorUser = 'teammember3'

async function getSiteId (name: string) {
  const { sites } = await query('{ sites { id name } }')
  return sites.find((s: any) => s.name === name).id
}

async function createUser (id: string, lastname: string, trainings: string[]) {
  await query(`
    mutation CreateUser ($userId: ID!, $lastname: String!, $email: String!, $trainings: [ID!]!) {
      createUser (userId: $userId, lastname: $lastname, email: $email, trainings: $trainings, system: false) {
        success
      }
    }`, { userId: id, lastname, email: `${id}@example.com`, trainings })
}

async function addSiteTeamMember (login: string, siteId: string, userId: string, access: string, roleIds?: string[], validateOnly?: boolean) {
  const { addSiteTeamMember } = await queryAs(login, `
    mutation AddSiteTeamMember ($siteId: ID!, $userId: ID!, $access: RoleAccessLevel!, $roleIds: [ID!], $validateOnly: Boolean) {
      addSiteTeamMember (siteId: $siteId, userId: $userId, access: $access, roleIds: $roleIds, validateOnly: $validateOnly) {
        success
        messages { message arg type }
      }
    }`, { siteId, userId, access, roleIds, validateOnly })
  return addSiteTeamMember
}

async function removeSiteTeamMember (login: string, siteId: string, userId: string, validateOnly?: boolean) {
  const { removeSiteTeamMember } = await queryAs(login, `
    mutation RemoveSiteTeamMember ($siteId: ID!, $userId: ID!, $validateOnly: Boolean) {
      removeSiteTeamMember (siteId: $siteId, userId: $userId, validateOnly: $validateOnly) {
        success
        messages { message arg type }
      }
    }`, { siteId, userId, validateOnly })
  return removeSiteTeamMember
}

async function rolesForUser (userId: string) {
  const { roles } = await query('query RolesForUser ($userId: ID!) { roles (filter: { users: [$userId] }) { id name } }', { userId })
  return roles.map((r: any) => r.name)
}

async function siteManagement (siteId: string) {
  const { sites } = await query('query SiteManagement ($id: ID!) { sites (filter: { ids: [$id] }) { owner { id } managers { id } comments { comment } } }', { id: siteId })
  return {
    ownerId: sites[0].owner?.id as string | undefined,
    managerIds: sites[0].managers.map((m: any) => m.id) as string[],
    comments: sites[0].comments.map((c: any) => c.comment) as string[]
  }
}

describe('site team member mutations', () => {
  before(async () => {
    dashboardSiteId = await getSiteId('dashboard-test')
    site1Id = await getSiteId('site1')
    const { sites } = await query('query SiteRoles ($id: ID!) { sites (filter: { ids: [$id] }) { auditRoles { id name access } } }', { id: dashboardSiteId })
    dashboardRoles = sites[0].auditRoles
    const { roles } = await query('{ roles (filter: { names: ["site3-editor"] }) { id } }')
    otherSiteRoleId = roles[0].id
    const { trainings } = await query('{ trainings { id } }')
    await createUser(trainedUser, 'Trained', [trainings[0].id])
    await createUser(untrainedUser, 'Untrained', [])
    await createUser(contributorUser, 'Contributor', [trainings[0].id])
  })

  it('should let a site manager add an editor to their site', async () => {
    const { success } = await addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'EDITOR')
    expect(success).to.be.true
    expect(await rolesForUser(trainedUser)).to.include('dashboard-test-editor')
  })

  it('should return a success message when the login is found', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, untrainedUser, 'READONLY', undefined, true)
    expect(success).to.be.true
    const message = messages.find((m: any) => m.arg === 'userId')
    expect(message.type).to.equal('success')
    expect(message.message).to.contain('User found')
  })

  it('should let a site owner add multiple contributor roles at once', async () => {
    const contributorRoleIds = dashboardRoles.filter(r => r.access === 'CONTRIBUTOR').map(r => r.id)
    expect(contributorRoleIds).to.have.length(2)
    const { success } = await addSiteTeamMember('db_owner', dashboardSiteId, contributorUser, 'CONTRIBUTOR', contributorRoleIds)
    expect(success).to.be.true
    const roleNames = await rolesForUser(contributorUser)
    expect(roleNames).to.include('dashboard-test-about-editor')
    expect(roleNames).to.include('dashboard-test-sandbox-contributor')
  })

  it('should allow readonly access for a user with no training', async () => {
    const { success } = await addSiteTeamMember('db_manager1', dashboardSiteId, untrainedUser, 'READONLY', undefined, true)
    expect(success).to.be.true
  })

  it('should not allow editor access for a user with no training', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, untrainedUser, 'EDITOR')
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'error')).to.be.true
    expect(await rolesForUser(untrainedUser)).to.not.include('dashboard-test-editor')
  })

  it('should not allow contributor access for a user with no training', async () => {
    const contributorRoleIds = dashboardRoles.filter(r => r.access === 'CONTRIBUTOR').map(r => r.id)
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, untrainedUser, 'CONTRIBUTOR', contributorRoleIds)
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'error')).to.be.true
  })

  it('should return an error when the login does not match a current user', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, 'notauser', 'READONLY')
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'error')).to.be.true
  })

  it('should return an error when no contributor roles are selected', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'CONTRIBUTOR')
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'roleIds' && m.type === 'error')).to.be.true
  })

  it('should return an error when a selected role belongs to another site', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'CONTRIBUTOR', [otherSiteRoleId])
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'roleIds' && m.type === 'error')).to.be.true
  })

  it('should warn but still succeed when the user already has the role', async () => {
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'EDITOR')
    expect(success).to.be.true
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'warning')).to.be.true
  })

  it('should not let a user hold two access levels on the same site', async () => {
    const contributorRoleIds = dashboardRoles.filter(r => r.access === 'CONTRIBUTOR').map(r => r.id)
    expect(await rolesForUser(trainedUser)).to.include('dashboard-test-editor')
    const { success, messages } = await addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'CONTRIBUTOR', contributorRoleIds)
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'access' && m.type === 'error')).to.be.true
    expect(await rolesForUser(trainedUser)).to.not.include('dashboard-test-sandbox-contributor')
  })

  it('should let a user hold more than one role at the same access level', async () => {
    const roleNames = await rolesForUser(contributorUser)
    expect(roleNames).to.include('dashboard-test-about-editor')
    expect(roleNames).to.include('dashboard-test-sandbox-contributor')
  })

  it('should not save anything when validateOnly is true', async () => {
    const { success } = await addSiteTeamMember('db_manager1', dashboardSiteId, untrainedUser, 'READONLY', undefined, true)
    expect(success).to.be.true
    expect(await rolesForUser(untrainedUser)).to.not.include('dashboard-test-readonly')
  })

  it('should not allow a user who does not manage the site to add a team member', async () => {
    await expect(addSiteTeamMember('ed07', dashboardSiteId, trainedUser, 'READONLY')).to.be.rejected
  })

  it('should not remove anything when validateOnly is true', async () => {
    const { success } = await removeSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, true)
    expect(success).to.be.true
    expect(await rolesForUser(trainedUser)).to.include('dashboard-test-editor')
  })

  it('should let a site manager remove a team member without touching their roles on other sites', async () => {
    await query('mutation AddRolesToUser ($roleIds: [ID!]!, $userId: ID!) { addRolesToUser (roleIds: $roleIds, userId: $userId) { success } }', { roleIds: [otherSiteRoleId], userId: trainedUser })
    expect(await rolesForUser(trainedUser)).to.include('site3-editor')
    const { success } = await removeSiteTeamMember('db_manager1', dashboardSiteId, trainedUser)
    expect(success).to.be.true
    const roleNames = await rolesForUser(trainedUser)
    expect(roleNames).to.not.include('dashboard-test-editor')
    expect(roleNames).to.not.include('dashboard-test-about-editor')
    expect(roleNames).to.not.include('dashboard-test-sandbox-contributor')
    expect(roleNames).to.include('site3-editor')
  })

  it('should return an error when the user is not a team member of the site', async () => {
    const { success, messages } = await removeSiteTeamMember('su01', dashboardSiteId, untrainedUser)
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'error')).to.be.true
  })

  it('should return an error when the login does not match a current user', async () => {
    const { success, messages } = await removeSiteTeamMember('db_manager1', dashboardSiteId, 'notauser')
    expect(success).to.be.false
    expect(messages.some((m: any) => m.arg === 'userId' && m.type === 'error')).to.be.true
  })

  it('should let a site manager remove another manager and record it in the site comments', async () => {
    const before = await siteManagement(dashboardSiteId)
    expect(before.managerIds).to.include('db_manager2')
    const { success } = await removeSiteTeamMember('db_manager1', dashboardSiteId, 'db_manager2')
    expect(success).to.be.true
    const after = await siteManagement(dashboardSiteId)
    expect(after.managerIds).to.not.include('db_manager2')
    expect(after.managerIds).to.include('db_manager1')
    expect(after.comments).to.include('Removed manager db_manager2.')
  })

  it('should remove the site owner\'s roles but warn that they are still the owner', async () => {
    const { success: added } = await addSiteTeamMember('su01', dashboardSiteId, 'db_owner', 'READONLY')
    expect(added).to.be.true
    expect(await rolesForUser('db_owner')).to.include('dashboard-test-readonly')
    const { success, messages } = await removeSiteTeamMember('db_manager1', dashboardSiteId, 'db_owner')
    expect(success).to.be.true
    const warning = messages.find((m: any) => m.arg === 'userId' && m.type === 'warning')
    expect(warning.message).to.contain('owner')
    expect(await rolesForUser('db_owner')).to.not.include('dashboard-test-readonly')
    const { ownerId } = await siteManagement(dashboardSiteId)
    expect(ownerId).to.equal('db_owner')
  })

  it('should not allow a user who does not manage the site to remove a team member', async () => {
    await expect(removeSiteTeamMember('ed07', dashboardSiteId, 'db_manager1')).to.be.rejected
  })

  // this one has to go last - it takes away db_manager1's authority over the site
  it('should revoke a manager\'s authority immediately when they remove themself', async () => {
    const { success } = await removeSiteTeamMember('db_manager1', dashboardSiteId, 'db_manager1')
    expect(success).to.be.true
    expect((await siteManagement(dashboardSiteId)).managerIds).to.not.include('db_manager1')
    // without invalidating their cached authInfo this would still succeed for up to 30 seconds
    await expect(addSiteTeamMember('db_manager1', dashboardSiteId, trainedUser, 'READONLY')).to.be.rejected
  })
})
