import { AuthorizedService } from '@txstate-mws/graphql-server'
import { PageFilter } from './page.model'
import { getPages } from './page.database'

export class PageService extends AuthorizedService {
  async find (filter: PageFilter) {
    return await getPages(filter)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
