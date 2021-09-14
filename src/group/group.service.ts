import { AuthorizedService } from '@txstate-mws/graphql-server'
import { ManyJoinedLoader } from 'dataloader-factory'
import { Group } from './group.model'
import { getGroups, getGroupsWithUser } from './group.database'

const groupsByUserIdLoader = new ManyJoinedLoader({
  fetch: async (userIds: string[], direct: boolean) => {
    return await getGroupsWithUser(userIds, { direct })
  }
})

export class GroupService extends AuthorizedService<Group> {
  async find () {
    return await getGroups()
  }

  async findByUserId (userId: string, direct: boolean) {
    return await this.loaders.get(groupsByUserIdLoader, direct).load(userId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
