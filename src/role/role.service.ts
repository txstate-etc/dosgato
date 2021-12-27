import { ValidatedResponse } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { unique } from 'txstate-utils'
import { DosGatoService } from '../util/authservice'
import { GroupService } from '../group'
import { UserService } from '../user'
import { Role, RoleFilter, RoleResponse } from './role.model'
import { assignRoleToUser, createRole, deleteRole, getRoles, getRolesWithGroup, getRolesForUsers, removeRoleFromUser, updateRole, removeRoleFromGroup, addRoleToGroup } from './role.database'

const rolesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getRoles({ ids })
  }
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

export class RoleService extends DosGatoService {
  async find (filter: RoleFilter) {
    const roles = await getRoles(filter)
    for (const role of roles) {
      this.loaders.get(rolesByIdLoader).prime(role.id, role)
    }
    return unique(roles, 'id')
  }

  async findById (id: string) {
    return await this.loaders.get(rolesByIdLoader).load(id)
  }

  async findByIds (ids: string[]) {
    return await this.loaders.loadMany(rolesByIdLoader, ids)
  }

  async findByGroupId (groupId: string, direct?: boolean) {
    const roles = await this.loaders.get(rolesByGroupIdLoader).load(groupId)
    if (typeof direct !== 'undefined' && direct) {
      return roles
    } else {
      // get parent groups
      const parentGroups = await this.svc(GroupService).getSuperGroups(groupId)
      // get the roles for those groups
      const result = await Promise.all(
        parentGroups.map(async pg => {
          return await this.loaders.get(rolesByGroupIdLoader).load(pg.id)
        })
      )
      const parentGroupRoles = unique(result.flat(), 'id')
      if (typeof direct === 'undefined') {
        return unique([...roles, ...parentGroupRoles], 'id')
      } else {
        return parentGroupRoles
      }
    }
  }

  async findByUserId (userId: string, direct?: boolean) {
    if (direct) {
      return await this.loaders.get(rolesByUserIdLoader).load(userId)
    } else {
      // get the user's groups
      const groups = await this.svc(GroupService).findByUserId(userId)
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

  async create (name: string) {
    if (!(await this.mayCreate())) throw new Error('Current user is not permitted to create roles.')
    const response = new RoleResponse({})
    try {
      const id = await createRole(name)
      const role = await this.findById(String(id))
      response.success = true
      response.role = role
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        response.addMessage(`Role ${name} already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while creating the role.')
    }
    return response
  }

  async update (id: string, name: string) {
    const role = await this.findById(id)
    if (!role) throw new Error('Role to be edited does not exist.')
    if (!(await this.mayUpdate(role))) throw new Error('Current user is not permitted to update role names.')
    const response = new RoleResponse({})
    try {
      await updateRole(id, name)
      const updated = await this.loaders.get(rolesByIdLoader).load(id)
      response.success = true
      response.role = updated
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        response.addMessage(`${name} role already exists.`, 'name')
        return response
      }
      throw new Error('An unknown error occurred while updating the role name.')
    }
    return response
  }

  async delete (id: string) {
    const role = await this.findById(id)
    if (!role) throw new Error('Role to be deleted does not exist.')
    if (!(await this.mayDelete(role))) throw new Error('Current user is not permitted to delete this role.')
    try {
      await deleteRole(id)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while deleting a role')
    }
  }

  async assignRoleToUser (roleId: string, userId: string) {
    const role = await this.findById(roleId)
    if (!role) throw new Error('Role to be assigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error('Current user is not permitted to assign users to this role.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot assign role to user who does not exist')
    try {
      await assignRoleToUser(roleId, user.internalId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while trying to assign a role to a user')
    }
  }

  async removeRoleFromUser (roleId: string, userId: string) {
    const role = await this.findById(roleId)
    if (!role) throw new Error('Role to be unassigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error('Current user is not permitted to unassign users from this role.')
    const user = await this.svc(UserService).findById(userId)
    if (!user) throw new Error('Cannot remove role from user who does not exist')
    try {
      const removed = await removeRoleFromUser(roleId, user.internalId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        const response = new ValidatedResponse()
        response.addMessage('role not assigned to user')
        return response
      }
    } catch (err: any) {
      throw new Error('An unknown error occurred while trying to remove a role from a user')
    }
  }

  async addRoleToGroup (groupId: string, roleId: string) {
    const [role, group] = await Promise.all([this.findById(roleId), this.svc(GroupService).findById(groupId)])
    if (!role) throw new Error('Role to be updated does not exist.')
    if (!group) throw new Error('Group to be assigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error('Current user is not permitted add groups to this role.')
    try {
      await addRoleToGroup(groupId, roleId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An unknown error occurred while adding a role to a group')
    }
  }

  async removeRoleFromGroup (groupId: string, roleId: string) {
    const [role, group] = await Promise.all([this.findById(roleId), this.svc(GroupService).findById(groupId)])
    if (!role) throw new Error('Role to be updated does not exist.')
    if (!group) throw new Error('Group to be assigned does not exist.')
    if (!(await this.mayAssign(role))) throw new Error('Current user is not permitted remove groups from this role.')
    try {
      const removed = await removeRoleFromGroup(groupId, roleId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        return ValidatedResponse.error('Role was not assigned to group.')
      }
    } catch (err: any) {
      throw new Error('An unknown error occurred while removing a role from a group')
    }
  }

  async getRoleForRule (roleId: string) {
    return await this.loaders.get(rolesByIdLoader).load(roleId)
  }

  async mayView (role: Role): Promise<boolean> {
    return true
  }

  async mayViewManagerUI () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayCreate () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayUpdate (role: Role) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayDelete (role: Role) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayAssign (role: Role) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayCreateRules (role: Role) {
    return await this.haveGlobalPerm('manageUsers')
  }
}
