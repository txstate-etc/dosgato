import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { User, UserFilter } from './user.model'
import { getUsers, getUsersInGroup } from './user.database'
import { GroupService } from '../group'
import { unique } from 'txstate-utils'

const usersByGroupIdLoader = new ManyJoinedLoader({
  fetch: async (groupIds: string[]) => {
    return await getUsersInGroup(groupIds)
  }
})

export class UserService extends AuthorizedService<User> {
  async find (filter: UserFilter) {
    if (filter.ids?.length) {
      const index = filter.ids?.indexOf('self')
      if (index > -1) filter.ids[index] = 'su01' // get this from ctx.auth
    }
    return await getUsers(filter)
  }

  async findByGroupId (groupId: string, direct?: boolean) {
    const users = await this.loaders.get(usersByGroupIdLoader).load(groupId)
    if (typeof direct !== 'undefined' && direct) {
      return users
    } else {
      const subgroups = await this.svc(GroupService).getSubgroups(groupId)
      const result = await Promise.all(
        subgroups.map(async sg => {
          return await this.loaders.get(usersByGroupIdLoader).load(sg.id)
        })
      )
      const subgroupUsers = unique(result.flat())
      if (typeof direct === 'undefined') {
        return unique([...users, ...subgroupUsers])
      } else {
        return subgroupUsers
      }
    }
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
