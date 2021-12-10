import { OneToManyLoader } from 'dataloader-factory'
import { Template } from '../template'
import { DosGatoService } from '../util/authservice'
import { tooPowerfulHelper } from '../util/rules'
import { getTemplateRules } from './templaterule.database'
import { TemplateRule, TemplateRuleFilter } from './templaterule.model'

const templateRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: TemplateRuleFilter) => {
    return await getTemplateRules({ ...filter, roleIds })
  },
  extractKey: (r: TemplateRule) => r.roleId,
  keysFromFilter: (filter: TemplateRuleFilter | undefined) => filter?.roleIds ?? []
})

export class TemplateRuleService extends DosGatoService {
  async findByRoleId (roleId: string, filter?: TemplateRuleFilter) {
    return await this.loaders.get(templateRulesByRoleLoader, filter).load(roleId)
  }

  async applies (rule: TemplateRule, template: Template) {
    return !rule.templateId || rule.templateId === template.id
  }

  asOrMorePowerful (ruleA: TemplateRule, ruleB: TemplateRule) { // is ruleA equal or more powerful than ruleB?
    return !ruleA.templateId || ruleA.templateId === ruleB.templateId
  }

  async tooPowerful (rule: TemplateRule) {
    return tooPowerfulHelper(rule, await this.currentTemplateRules(), this.asOrMorePowerful)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
