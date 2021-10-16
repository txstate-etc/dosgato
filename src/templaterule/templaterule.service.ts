import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getTemplateRules } from './templaterule.database'
import { TemplateRule } from './templaterule.model'

const templateRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getTemplateRules(roleIds)
  },
  extractKey: (r: TemplateRule) => r.roleId
})

export class TemplateRuleService extends AuthorizedService {
  async getRules (roleId: string) {
    return await this.loaders.get(templateRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
