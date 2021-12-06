import { AuthorizedService } from '@txstate-mws/graphql-server'
import { UserService } from '../user'

export abstract class DosGatoService extends AuthorizedService<{ login: string }> {
  async currentUser () {
    if (!this.auth?.login) return undefined
    return await this.svc(UserService).findById(this.auth.login)
  }
}
