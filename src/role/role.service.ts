import { BaseService, MutationMessageType, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import db from 'mysql2-async/db'
import { intersect, isBlank, isNotNull, unique } from 'txstate-utils'
import {
  DosGatoService, GroupService, UserService, type Role, type RoleFilter, RoleResponse,
  addRolesToUser, createRole, deleteRole, getRoles, getRolesWithGroup, getRolesWithManager,
  getRolesForUsers, removeRoleFromUser, updateRole, removeRoleFromGroup, addRoleToGroups,
  GroupServiceInternal, GlobalRuleServiceInternal, SiteRuleServiceInternal, AssetRuleServiceInternal,
  DataRuleServiceInternal, PageRuleServiceInternal, TemplateRuleServiceInternal, GlobalRuleService, AssetRuleService,
  DataRuleService, PageRuleService, SiteRuleService, TemplateRuleService, roleNameIsUnique, assignRoleToUsers,
  type RoleInput, accessLevelUniqueForSite, RoleAccessLevel, SiteServiceInternal, SiteTeamMemberResponse, UserServiceInternal,
  removeSiteManager, invalidateAuthInfo, updateSiteTeamMemberAccess, type Site, type User
} from '../internal.js'

const trainingRequiredMessage = 'The selected user can only be granted Read-only access at this time. If the user recently completed training, please allow 24 hours for the user\'s training status to update.'

const rolesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => await getRoles({ ids })
})

const rolesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => await getRoles({ siteIds }),
  extractKey: role => role.siteId!,
  idLoader: rolesByIdLoader
})

const rolesByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[]) => await getRolesWithGroup(groupIds),
  idLoader: rolesByIdLoader
})

const rolesByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[]) => await getRolesForUsers(userIds),
  idLoader: rolesByIdLoader
})

const rolesByManagerIdLoader = new ManyJoinedLoader({
  fetch: async (managerIds: string[]) => await getRolesWithManager(managerIds),
  idLoader: rolesByIdLoader
})

export class RoleServiceInternal extends BaseService {
  async find (filter?: RoleFilter) {
    const roles = await getRoles(filter)
    for (const role of roles) {
      this.loaders.get(rolesByIdLoader).prime(role.id, role)
    }
    return unique(roles, 'id')
  }

  async findById (id: string) {
    return await this.loaders.get(rolesByIdLoader).load(id)
  }

  async findByIds (ids: string[], filter?: RoleFilter) {
    return await this.find({ ...filter, ids: intersect({ skipEmpty: true }, filter?.ids, ids) })
  }

  async findByGroupId (groupId: string, direct?: boolean) {
    let roles = await this.loaders.get(rolesByGroupIdLoader).load(groupId)
    if (!direct) {
      // get parent groups
      const parentGroups = await this.svc(GroupServiceInternal).getSuperGroups(groupId)
      // get the roles for those groups
      const result = await Promise.all(
        parentGroups.map(async pg => await this.loaders.get(rolesByGroupIdLoader).load(pg.id))
      )
      const parentGroupRoles = unique(result.flat(), 'id')
      if (typeof direct === 'undefined') {
        roles = unique([...roles, ...parentGroupRoles], 'id')
      } else {
        roles = parentGroupRoles
      }
    }
    return roles
  }

  async findByUserId (userId: string, direct?: boolean) {
    if (direct) {
      return await this.loaders.get(rolesByUserIdLoader).load(userId)
    } else {
      // get the user's groups
      const groups = await this.svc(GroupServiceInternal).findByUserId(userId)
      // get the roles for those groups
      const [roles, ...indirectRolesUnflattened] = await Promise.all([
        this.loaders.get(rolesByUserIdLoader).load(userId),
        ...groups.map(async g => await this.loaders.get(rolesByGroupIdLoader).load(g.id))
      ])
      const indirectRoles = unique(indirectRolesUnflattened.flat(), 'id')
      if (typeof direct === 'undefined') {
        return unique([...roles, ...indirectRoles], 'id')
      } else {
        return indirectRoles
      }
    }
  }

  async findByManagerId (managerId: string) {
    return await this.loaders.get(rolesByManagerIdLoader).load(managerId)
  }

  async findBySiteId (siteId: string) {
    return await this.loaders.get(rolesBySiteIdLoader).load(siteId)
  }
}

export class RoleService extends DosGatoService<Role> {
  raw = this.svc(RoleServiceInternal)

  async find (filter?: RoleFilter) {
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByIds (ids: string[], filter?: RoleFilter) {
    return this.removeUnauthorized(await this.raw.findByIds(ids, filter))
  }

  async findByGroupId (groupId: string, direct?: boolean) {
    return this.removeUnauthorized(await this.raw.findByGroupId(groupId, direct))
  }

  async findByUserId (userId: string, direct?: boolean) {
    return this.removeUnauthorized(await this.raw.findByUserId(userId, direct))
  }

  async findByManagerId (managerId: string) {
    return this.removeUnauthorized(await this.raw.findByManagerId(managerId))
  }

  async findBySiteId (siteId: string) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async create (input: RoleInput, validateOnly?: boolean) {
    if (!this.mayCreate()) throw new Error('Current user is not permitted to create roles.')
    const response = new RoleResponse({ success: true })
    if (!(await roleNameIsUnique(input.name))) {
      response.addMessage(`Role ${input.name}  already exists`, 'name')
    }
    if (input.description && input.description.length > 200) {
      response.addMessage('Role description cannot exceed 200 characters', 'description')
    }
    if (input.siteId && isBlank(input.access)) {
      response.addMessage('Access level must be specified when creating a site-specific role.', 'access')
    }
    // We only allow one role per site to be designated as the editor role. Same for the read-only role.
    if (input.siteId && input.access && input.access !== 'contributor') {
      if (!await accessLevelUniqueForSite(input.siteId, input.access, input.name)) {
        response.addMessage(`A role with ${input.access} access level already exists for this site.`, 'access')
      }
    }
    if (validateOnly || response.hasErrors()) return response
    const id = await createRole(input)
    response.role = await this.raw.findById(String(id))
    return response
  }

  async update (id: string, input: RoleInput, validateOnly?: boolean) {
    const role = await this.raw.findById(id)
    if (!role) throw new Error('Role to be edited does not exist.')
    if (!this.mayUpdate(role)) throw new Error('Current user is not permitted to update role names.')
    const response = new RoleResponse({ success: true })
    if (input.name !== role.name && !(await roleNameIsUnique(input.name))) {
      response.addMessage(`Role ${input.name}  already exists`, 'name')
    }
    if (input.description && input.description.length > 200) {
      response.addMessage('Role description cannot exceed 200 characters', 'description')
    }
    if (input.siteId && isBlank(input.access)) {
      response.addMessage('Access level must be specified when creating a site-specific role.', 'access')
    }
    // We only allow one role per site to be designated as the editor role. Same for the read-only role.
    if (input.siteId && input.access && input.access !== 'contributor') {
      if (!await accessLevelUniqueForSite(input.siteId, input.access, input.name)) {
        response.addMessage(`A role with ${input.access} access level already exists for this site.`, 'access')
      }
    }
    if (validateOnly || response.hasErrors()) {
      return response
    }
    await updateRole(id, input)
    this.loaders.clear()
    response.role = await this.raw.findById(id)
    return response
  }

  async delete (id: string) {
    const role = await this.findById(id)
    if (!role) throw new Error('Role to be deleted does not exist.')
    if (!this.mayDelete(role)) throw new Error(`Current user is not permitted to delete role ${role.name}.`)
    try {
      await deleteRole(id)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while attempting to delete role ${role.name}.`)
    }
  }

  async addRolesToUser (roleIds: string[], userId: string) {
    const roles = await this.findByIds(roleIds)
    if (!roles.length) throw new Error('No valid roles were provided.')
    const mayAssign = await Promise.all(roles.map(async role => await this.mayAssign(role)))
    const mayNotAssignIndexes = mayAssign.map((allowed, i) => allowed ? undefined : i).filter(isNotNull)
    if (mayNotAssignIndexes.length) return ValidatedResponse.error(`The current user is not allowed to assign roles:\n${mayNotAssignIndexes.map(i => roles[i].name).join('\n')}`, 'roleIds')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot assign role to user who does not exist')
    try {
      await addRolesToUser(roleIds, user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while trying to assign roles (${roles.map(role => role.name).join(', ')}) to user ${user.id}.`)
    }
  }

  /**
   * Figure out which of a site's roles carry the requested access level. Editors and read-only
   * users get every role at that level (there should be only one of each), while contributors pick the specific roles they need,
   * so those have to be named and have to belong to this site at that access level.
   */
  protected async resolveTargetRoles (siteId: string, access: RoleAccessLevel, roleIds: string[] | undefined, response: SiteTeamMemberResponse) {
    const rolesForAccess = (await this.raw.findBySiteId(siteId)).filter(r => r.access === access)
    if (!rolesForAccess.length) {
      response.addMessage(`There are no ${access} roles available for this site. Without roles assigned, this team member will not have any access to the site. Contact support to create a role with ${access} access.`, 'access')
      return []
    }
    if (access !== RoleAccessLevel.CONTRIBUTOR) return rolesForAccess
    if (!roleIds?.length) {
      response.addMessage('At least one role must be selected.', 'roleIds')
      return []
    }
    const requested = unique(roleIds)
    const targetRoles = rolesForAccess.filter(r => requested.includes(r.id))
    if (targetRoles.length !== requested.length) {
      response.addMessage(`One or more of the selected roles are not ${access} roles for this site.`, 'roleIds')
    }
    return targetRoles
  }

  /**
   * Gather everything the edit and remove mutations need to know about a user's standing on a
   * site: the roles they hold on it directly, the ones they only have through a group, and
   * whether they manage or own it. A user with none of the above is not on the team at all,
   * which both mutations treat as an error, so that message is added here and reported back as
   * `isTeamMember: false`.
   */
  protected async loadTeamStanding (site: Site, user: User, response: ValidatedResponse) {
    const [trainings, directRoles, indirectRoles, managedSites] = await Promise.all([
      this.svc(UserServiceInternal).getTrainings(user.internalId),
      this.raw.findByUserId(user.id, true),
      this.raw.findByUserId(user.id, false),
      this.svc(SiteServiceInternal).findByManagerInternalId(user.internalId)
    ])
    const currentSiteRoles = directRoles.filter(r => r.siteId === site.id)
    const groupSiteRoles = indirectRoles.filter(r => r.siteId === site.id)
    const isManager = managedSites.some(s => s.id === site.id)
    const isOwner = site.ownerId === user.internalId
    const isTeamMember = !!currentSiteRoles.length || isManager || isOwner
    if (!isTeamMember) response.addMessage(`${user.name} is not a team member of ${site.name}.`, 'userId')
    return { trainings, currentSiteRoles, groupSiteRoles, isManager, isOwner, isTeamMember }
  }

  /**
   * Add a user to a site's team by giving them the site role(s) that carry the requested
   * access level. Site owners and managers may do this for their own sites without the
   * global manageAccess permission, so all the validation a manager needs (does this login
   * exist, do they have training, does this site have a role at that access level) happens
   * here and comes back as messages instead of requiring them to look users up directly.
   */
  async addSiteTeamMember (siteId: string, userId: string, access: RoleAccessLevel, roleIds?: string[], validateOnly?: boolean) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Site does not exist.')
    if (!this.mayManageTeam(site)) throw new Error('You are not permitted to add team members to this site.')
    const response = new SiteTeamMemberResponse({ success: true })

    // figure out which of the site's roles we have been asked to assign
    const targetRoles = await this.resolveTargetRoles(siteId, access, roleIds, response)

    // we already know the current user manages this site, so we may look the requested user
    // up with the internal service and tell the manager what we found
    const user = await this.svc(UserServiceInternal).findById(userId)
    response.user = user
    if (!user || user.disabled) {
      response.addMessage('User not found. Allow 24 hours for new users to populate in the system.', 'userId')
    } else {
      // directRoles governs the conflict check below, since a manager cannot remove a role the
      // user only holds through a group; allRoles is for the dupes warning, where a group-granted
      // role is still worth mentioning. the shared direct lookup is cached by the dataloader.
      const [trainings, directRoles, allRoles] = await Promise.all([
        this.svc(UserServiceInternal).getTrainings(user.internalId),
        this.raw.findByUserId(user.id, true),
        this.raw.findByUserId(user.id)
      ])
      // a user gets one access level per site, so a role at any other level has to go first
      const conflicting = directRoles.filter(r => r.siteId === siteId && r.access && r.access !== access)
      if (!trainings.length && access !== RoleAccessLevel.READONLY) {
        response.addMessage(trainingRequiredMessage, 'userId')
      } else if (conflicting.length) {
        response.addMessage(`${user.name} already has ${unique(conflicting.map(r => r.access!)).join(' and ')} access to this site. Use Edit User to change their access level.`, 'access')
      } else if (targetRoles.length) {
        const dupes = targetRoles.filter(r => allRoles.some(e => e.id === r.id))
        if (dupes.length) {
          response.addMessage(`${user.name} already has the ${dupes.map(r => r.name).join(', ')} role${dupes.length === 1 ? '' : 's'}.`, 'userId', MutationMessageType.warning)
        } else {
          response.addMessage('User found', 'userId', MutationMessageType.success)
        }
      }
    }

    // this has to happen before the validateOnly return, or a dry run would report success on
    // an access level the current user is not allowed to hand out
    const mayAssign = await Promise.all(targetRoles.map(async r => await this.mayAssign(r)))
    if (mayAssign.some(allowed => !allowed)) {
      response.addMessage('You are not permitted to assign one or more of the selected roles.', 'roleIds')
    }

    if (validateOnly || response.hasErrors()) return response
    if (!user) return response // unreachable, but keeps the compiler happy

    await addRolesToUser(targetRoles.map(r => r.id), user.internalId)
    this.loaders.clear()
    return response
  }

  async editSiteTeamMember (siteId: string, userId: string, access: RoleAccessLevel, roleIds?: string[], validateOnly?: boolean) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Site does not exist.')
    if (!this.mayManageTeam(site)) throw new Error('You are not permitted to edit team member access for this site.')
    const response = new SiteTeamMemberResponse({ success: true })

    const targetRoles = await this.resolveTargetRoles(siteId, access, roleIds, response)
    const mayAssign = await Promise.all(targetRoles.map(async r => await this.mayAssign(r)))
    if (mayAssign.some(canAssign => !canAssign)) {
      response.addMessage('You do not have permission to assign this access level to this user.', 'roleIds')
    }

    const user = await this.svc(UserServiceInternal).findById(userId)
    response.user = user
    if (!user || user.disabled) {
      response.addMessage('User not found. Allow 24 hours for new users to populate in the system.', 'userId')
      return response
    }

    // this mutation edits an existing team member's access; adding someone new is
    // addSiteTeamMember's job, so a user with no standing on this site is an error
    const { trainings, currentSiteRoles, isTeamMember } = await this.loadTeamStanding(site, user, response)
    if (!isTeamMember) return response

    if (!trainings.length && access !== RoleAccessLevel.READONLY) {
      response.addMessage(trainingRequiredMessage, 'userId')
    }

    // taking a role away needs the same authority as handing it out
    const targetRoleIds = new Set(targetRoles.map(r => r.id))
    const rolesToRevoke = currentSiteRoles.filter(r => !targetRoleIds.has(r.id))
    const mayRevoke = await Promise.all(rolesToRevoke.map(async r => await this.mayAssign(r)))
    if (mayRevoke.some(allowed => !allowed)) {
      response.addMessage(`You are not permitted to remove one or more of ${user.name}'s current roles.`, 'roleIds')
    }

    if (validateOnly || response.hasErrors()) return response

    await updateSiteTeamMemberAccess(siteId, user.internalId, targetRoles.map(r => r.id))
    this.loaders.clear()
    await invalidateAuthInfo(user.id)
    return response
  }

  /**
   * Remove a user from a site's team: revoke the site roles they hold directly and, if they are
   * one of the site's managers, revoke that too. Site owners and managers may do this for their
   * own sites without the global manageAccess permission.
   *
   * Only an administrator can change site ownership.
   */
  async removeSiteTeamMember (siteId: string, userId: string, validateOnly?: boolean) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Site does not exist.')
    if (!this.mayManageTeam(site)) throw new Error('You are not permitted to remove team members from this site.')
    const response = new ValidatedResponse({ success: true })

    // we already know the current user manages this site, so we may look the requested user
    // up with the internal service
    const user = await this.svc(UserServiceInternal).findById(userId)
    if (!user) {
      response.addMessage('User not found.', 'userId')
      return response
    }

    // everything below is about the target user's standing on this site, NOT the current user's
    const { currentSiteRoles, groupSiteRoles, isManager, isOwner, isTeamMember } = await this.loadTeamStanding(site, user, response)
    if (!isTeamMember) return response

    // roles that arrive through a group live in groups_roles and cannot be removed for one user
    if (groupSiteRoles.length) {
      response.addMessage(`${user.name} also has the ${groupSiteRoles.map(r => r.name).join(', ')} role${groupSiteRoles.length === 1 ? '' : 's'} through a group. Group membership must be changed separately.`, undefined, MutationMessageType.warning)
    }
    if (isOwner) {
      response.addMessage(`${user.name} remains the owner of ${site.name}. An administrator must change site ownership.`, 'userId', MutationMessageType.warning)
    }
    const mayAssign = await Promise.all(currentSiteRoles.map(async r => await this.mayAssign(r)))
    if (mayAssign.some(allowed => !allowed)) {
      response.addMessage(`You are not permitted to remove one or more of ${user.name}'s roles.`, 'userId')
    }

    if (validateOnly || response.hasErrors()) return response

    await db.transaction(async tdb => {
      for (const r of currentSiteRoles) await removeRoleFromUser(r.id, user.internalId, tdb)
      if (isManager) await removeSiteManager(site, user.internalId, this.ctx.authInfo.user!.internalId, tdb)
    }, { retries: 5 })
    this.loaders.clear()
    await invalidateAuthInfo(user.id)
    // invalidating does nothing for the request we are already in the middle of, so if they removed
    // themselves, take the site out of the authInfo this request is holding as well. an owner keeps
    // the site either way - losing manager status does not cost them their ownership authority.
    if (user.internalId === this.ctx.authInfo.user?.internalId && !isOwner) {
      this.ctx.authInfo.ownedOrManagedSiteIds = this.ctx.authInfo.ownedOrManagedSiteIds?.filter(id => id !== siteId)
    }
    return response
  }

  async assignRoleToUsers (roleId: string, userIds: string[]) {
    const role = await this.findById(roleId)
    if (!role) throw new Error('Specified role does not exist.')
    if (!(await this.mayAssign(role))) throw new Error(`Current user is not permitted to assign role ${role.name} to users.`)
    const users = (await Promise.all(userIds.map(async u => await this.svc(UserService).findById(u)))).filter(isNotNull)
    if (!users.length) throw new Error('Cannot assign role to user(s)')
    await assignRoleToUsers(roleId, users.map(u => u.internalId))
    return new ValidatedResponse({ success: true })
  }

  async removeRoleFromUser (roleId: string, userId: string) {
    const role = await this.findById(roleId)
    if (!role) throw new Error('Role to be unassigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error(`Current user is not permitted to unassign users from role ${role.name}.`)
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot remove role from user who does not exist')
    try {
      const removed = await removeRoleFromUser(roleId, user.internalId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage(`Role ${role.name} not assigned to user ${user.id}`)
        return response
      }
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while trying to remove role ${role.name} from user ${user.id}.`)
    }
  }

  async addRoleToGroups (groupIds: string[], roleId: string) {
    const role = await this.findById(roleId)
    if (!role) throw new Error('Specified role does not exist.')
    if (!(await this.mayAssign(role))) throw new Error(`Current user is not permitted to assign role ${role.name} to groups.`)
    const groups = (await Promise.all(groupIds.map(async g => await this.svc(GroupService).findById(g)))).filter(isNotNull)
    if (!groups.length) throw new Error('Cannot assign role to group(s)')
    await addRoleToGroups(groups.map(g => g.id), roleId)
    return new ValidatedResponse({ success: true })
  }

  async removeRoleFromGroup (groupId: string, roleId: string) {
    const [role, group] = await Promise.all([this.findById(roleId), this.svc(GroupService).findById(groupId)])
    if (!role) throw new Error('Role to be updated does not exist.')
    if (!group) throw new Error('Group to be assigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error(`Current user is not permitted remove role ${role.name} from group ${group.name}.`)
    try {
      const removed = await removeRoleFromGroup(groupId, roleId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        return ValidatedResponse.error(`Role ${role.name} was not assigned to group ${group.name}.`)
      }
    } catch (err: any) {
      console.error(err)
      throw new Error(`An unknown error occurred while removing role ${role.name} from group ${group.name}.`)
    }
  }

  async getRoleForRule (roleId: string) {
    return await this.loaders.get(rolesByIdLoader).load(roleId)
  }

  mayView (role: Role) {
    if (this.haveGlobalPerm('manageAccess')) return true
    if (role.siteId && (this.ctx.authInfo.ownedOrManagedSiteIds?.includes(role.siteId) || this.ctx.authInfo.pageSiteIds?.includes(role.siteId))) return true
    return this.ctx.authInfo.roles.some(r => r.id === role.id)
  }

  mayViewManagerUI () {
    return this.haveGlobalPerm('manageAccess')
  }

  mayCreate () {
    // TODO: Check manageParentRoles permission if they are trying to create a top-level role
    return this.haveGlobalPerm('manageAccess')
  }

  mayUpdate (role: Role) {
    // TODO: Check manageParentRoles permission if they are trying to update a top-level role
    return this.haveGlobalPerm('manageAccess')
  }

  mayDelete (role: Role) {
    // TODO: Check manageParentRoles permission if they are trying to delete a top-level role?
    return this.haveGlobalPerm('manageAccess')
  }

  mayManageTeam (site: { id: string }) {
    // owners and managers derive this authority from the site record rather than from rules
    if (this.ctx.authInfo.ownedOrManagedSiteIds?.includes(site.id)) return true
    return this.haveGlobalPerm('manageAccess')
  }

  async mayAssign (role: Role) {
    // site owners and managers may assign any role belonging to a site they own or manage
    // this has to come before the tooPowerful check below, since owners and managers derive their
    // authority from the site record rather than from rules, so they have no rules to compare against
    if (role.siteId && this.ctx.authInfo.ownedOrManagedSiteIds?.includes(role.siteId)) return true
    const [globalRules, siteRules, assetRules, dataRules, pageRules, templateRules] = (await Promise.all([
      this.svc(GlobalRuleServiceInternal).findByRoleId(role.id),
      this.svc(SiteRuleServiceInternal).findByRoleId(role.id),
      this.svc(AssetRuleServiceInternal).findByRoleId(role.id),
      this.svc(DataRuleServiceInternal).findByRoleId(role.id),
      this.svc(PageRuleServiceInternal).findByRoleId(role.id),
      this.svc(TemplateRuleServiceInternal).findByRoleId(role.id)
    ]))
    const tooPowerful = [
      ...globalRules.map(rule => this.svc(GlobalRuleService).tooPowerful(rule)),
      ...siteRules.map(rule => this.svc(SiteRuleService).tooPowerful(rule)),
      ...assetRules.map(rule => this.svc(AssetRuleService).tooPowerful(rule)),
      ...dataRules.map(rule => this.svc(DataRuleService).tooPowerful(rule)),
      ...pageRules.map(rule => this.svc(PageRuleService).tooPowerful(rule)),
      ...templateRules.map(rule => this.svc(TemplateRuleService).tooPowerful(rule))
    ]
    if (tooPowerful.some(b => b)) return false
    return this.haveGlobalPerm('manageAccess')
  }

  mayCreateRules (role: Role) {
    return this.haveGlobalPerm('manageAccess')
  }
}
