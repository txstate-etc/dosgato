import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { Template } from '../template'
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
  async findByRoleId (roleId: string, filter?: TemplateRuleFilter) {
    return await this.loaders.get(templateRulesByRoleLoader, filter).load(roleId)
  }

  async applies (rule: TemplateRule, template: Template) {
    return !rule.templateId || rule.templateId === template.id
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
