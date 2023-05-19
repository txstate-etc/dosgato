import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { intersect, isNotNull, unique } from 'txstate-utils'
import {
  DosGatoService, GroupService, UserService, type Role, type RoleFilter, RoleResponse,
  addRolesToUser, createRole, deleteRole, getRoles, getRolesWithGroup, getRolesWithManager,
  getRolesForUsers, removeRoleFromUser, updateRole, removeRoleFromGroup, addRoleToGroups,
  GroupServiceInternal, GlobalRuleServiceInternal, SiteRuleServiceInternal, AssetRuleServiceInternal,
  DataRuleServiceInternal, PageRuleServiceInternal, TemplateRuleServiceInternal, GlobalRuleService, AssetRuleService,
  DataRuleService, PageRuleService, SiteRuleService, TemplateRuleService, roleNameIsUnique, assignRoleToUsers
} from '../internal.js'

const rolesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getRoles({ ids })
  }
})

const rolesBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => {
    return await getRoles({ siteIds })
  },
  extractKey: role => role.siteId!,
  idLoader: rolesByIdLoader
})

const rolesByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[]) => {
    return await getRolesWithGroup(groupIds)
  },
  idLoader: rolesByIdLoader
})

const rolesByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[]) => {
    return await getRolesForUsers(userIds)
  },
  idLoader: rolesByIdLoader
})

const rolesByManagerIdLoader = new ManyJoinedLoader({
  fetch: async (managerIds: string[]) => {
    return await getRolesWithManager(managerIds)
  },
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
        parentGroups.map(async pg => {
          return await this.loaders.get(rolesByGroupIdLoader).load(pg.id)
        })
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
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByIds (ids: string[], filter?: RoleFilter) {
    return await this.removeUnauthorized(await this.raw.findByIds(ids, filter))
  }

  async findByGroupId (groupId: string, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByGroupId(groupId, direct))
  }

  async findByUserId (userId: string, direct?: boolean) {
    return await this.removeUnauthorized(await this.raw.findByUserId(userId, direct))
  }

  async findByManagerId (managerId: string) {
    return await this.removeUnauthorized(await this.raw.findByManagerId(managerId))
  }

  async findBySiteId (siteId: string) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async create (name: string, validateOnly?: boolean) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create roles.')
    const response = new RoleResponse({ success: true })
    if (!(await roleNameIsUnique(name))) {
      response.addMessage(`Role ${name}  already exists`, 'name')
    }
    if (validateOnly || response.hasErrors()) return response
    const id = await createRole(name)
    response.role = await this.raw.findById(String(id))
    return response
  }

  async update (id: string, name: string, validateOnly?: boolean) {
    const role = await this.raw.findById(id)
    if (!role) throw new Error('Role to be edited does not exist.')
    if (!(await this.mayUpdate(role))) throw new Error('Current user is not permitted to update role names.')
    const response = new RoleResponse({ success: true })
    if (name !== role.name && !(await roleNameIsUnique(name))) {
      response.addMessage(`Role ${name}  already exists`, 'name')
    }
    if (validateOnly || response.hasErrors()) {
      return response
    }
    await updateRole(id, name)
    this.loaders.clear()
    response.role = await this.raw.findById(id)
    return response
  }

  async delete (id: string) {
    const role = await this.findById(id)
    if (!role) throw new Error('Role to be deleted does not exist.')
    if (!(await this.mayDelete(role))) throw new Error(`Current user is not permitted to delete role ${role.name}.`)
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

  protected currentRolesSet?: Set<string>
  async mayView (role: Role): Promise<boolean> {
    if (await this.haveGlobalPerm('manageAccess')) return true
    return (await this.currentRoles()).some(r => r.id === role.id)
  }

  async mayViewManagerUI () {
    return await this.haveGlobalPerm('manageAccess')
  }

  async mayCreate () {
    // TODO: Check manageParentRoles permission if they are trying to create a top-level role
    return await this.haveGlobalPerm('manageAccess')
  }

  async mayUpdate (role: Role) {
    // TODO: Check manageParentRoles permission if they are trying to update a top-level role
    return await this.haveGlobalPerm('manageAccess')
  }

  async mayDelete (role: Role) {
    // TODO: Check manageParentRoles permission if they are trying to delete a top-level role?
    return await this.haveGlobalPerm('manageAccess')
  }

  async mayAssign (role: Role) {
    const [globalRules, siteRules, assetRules, dataRules, pageRules, templateRules] = (await Promise.all([
      this.svc(GlobalRuleServiceInternal).findByRoleId(role.id),
      this.svc(SiteRuleServiceInternal).findByRoleId(role.id),
      this.svc(AssetRuleServiceInternal).findByRoleId(role.id),
      this.svc(DataRuleServiceInternal).findByRoleId(role.id),
      this.svc(PageRuleServiceInternal).findByRoleId(role.id),
      this.svc(TemplateRuleServiceInternal).findByRoleId(role.id)
    ]))
    const tooPowerful = await Promise.all([
      ...globalRules.map(async rule => await this.svc(GlobalRuleService).tooPowerful(rule)),
      ...siteRules.map(async rule => await this.svc(SiteRuleService).tooPowerful(rule)),
      ...assetRules.map(async rule => await this.svc(AssetRuleService).tooPowerful(rule)),
      ...dataRules.map(async rule => await this.svc(DataRuleService).tooPowerful(rule)),
      ...pageRules.map(async rule => await this.svc(PageRuleService).tooPowerful(rule)),
      ...templateRules.map(async rule => await this.svc(TemplateRuleService).tooPowerful(rule))
    ])
    if (tooPowerful.some(b => b)) return false
    // TODO: The logic we discussed when we were defining the manageAccess and manageParentRoles permissions
    // was to check if the role was associated with a site (has a site ID)
    // If it does not have a site ID, they can assign the role if they have the manageParentRoles permission
    // It it does have a site ID, we let them assign the role if they have the manage Access permission OR they
    // are a site manager. Until manageParentRoles is fully implemented, they can assign the role if they
    // have the manageAccess permission.
    return await this.haveGlobalPerm('manageAccess')
  }

  async mayCreateRules (role: Role) {
    // TODO: Check manageParentRoles permission if they are trying to create rules for a top-level role
    return await this.haveGlobalPerm('manageAccess')
  }
}
