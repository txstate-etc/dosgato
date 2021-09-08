import { AuthorizedService } from '@txstate-mws/graphql-server'
import { User, UserFilter } from './user.model'
import { getUsers } from './user.database'

export class UserService extends AuthorizedService<User> {
  async find (filter: UserFilter) {
    if (filter.ids?.length) {
      const index = filter.ids?.indexOf('self')
      if (index > -1) filter.ids[index] = 'su01' // get this from ctx.auth
    }
    return await getUsers(filter)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
