import { AuthorizedService } from '@txstate-mws/graphql-server'
import { TemplateFilter } from './template.model'
import { getTemplates } from './template.database'

export class TemplateService extends AuthorizedService {
  async find (filter?: TemplateFilter) {
    return await getTemplates(filter)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
