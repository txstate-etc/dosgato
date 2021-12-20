import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { Role, RoleFilter, RoleResponse } from './role.model'
import { createRole, getRoles, getRolesWithGroup, getRolesForUsers, updateRole } from './role.database'
import { unique } from 'txstate-utils'
import { GroupService } from '../group'
import { DosGatoService } from '../util/authservice'

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
    if (!(await this.mayManageRoles())) throw new Error('Current user is not permitted to create roles.')
    const response = new RoleResponse({})
    try {
      const id = await createRole(name)
      const role = await this.loaders.get(rolesByIdLoader).load(String(id))
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
    if (!(await this.mayManageRoles())) throw new Error('Current user is not permitted to update role names.')
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

  async getRoleForRule (roleId: string) {
    return await this.loaders.get(rolesByIdLoader).load(roleId)
  }

  async mayView (role: Role): Promise<boolean> {
    return true
  }

  async mayManageRoles () {
    return await this.haveGlobalPerm('manageUsers')
  }

  async mayCreateRules (role: Role) {
    return await this.haveGlobalPerm('manageUsers')
  }
}
