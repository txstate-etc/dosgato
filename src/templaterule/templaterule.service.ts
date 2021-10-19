import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getTemplateRules } from './templaterule.database'
import { TemplateRule, TemplateRuleFilter } from './templaterule.model'

const templateRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: TemplateRuleFilter) => {
    return await getTemplateRules({ ...filter, roleIds })
  },
  extractKey: (r: TemplateRule) => r.roleId,
  keysFromFilter: (filter: TemplateRuleFilter | undefined) => filter?.roleIds ?? []
})

export class TemplateRuleService extends AuthorizedService {
  async getRules (roleId: string, filter?: TemplateRuleFilter) {
    return await this.loaders.get(templateRulesByRoleLoader, filter).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
