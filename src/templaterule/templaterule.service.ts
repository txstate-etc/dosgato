import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Cache } from 'txstate-utils'
import {
  Template, DosGatoService, tooPowerfulHelper, getTemplateRules, TemplateRule, TemplateRuleFilter,
  CreateTemplateRuleInput, RoleService, createTemplateRule, TemplateRuleResponse, updateTemplateRule,
  UpdateTemplateRuleInput, deleteTemplateRule, RoleServiceInternal
} from '../internal.js'

const templateRulesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getTemplateRules({ ids })
  }
})

const templateRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[], filter?: TemplateRuleFilter) => {
    return await getTemplateRules({ ...filter, roleIds })
  },
  extractKey: (r: TemplateRule) => r.roleId,
  keysFromFilter: (filter: TemplateRuleFilter | undefined) => filter?.roleIds ?? []
})

const globalTemplateRulesCache = new Cache(async () => await getTemplateRules({ templateIds: [null] }), { freshseconds: 3 })

export class TemplateRuleServiceInternal extends BaseService {
  async findById (ruleId: string) {
    return await this.loaders.get(templateRulesByIdLoader).load(ruleId)
  }

  async findByRoleId (roleId: string, filter?: TemplateRuleFilter) {
    return await this.loaders.get(templateRulesByRoleLoader, filter).load(roleId)
  }
}

export class TemplateRuleService extends DosGatoService<TemplateRule> {
  raw = this.svc(TemplateRuleServiceInternal)

  async findById (ruleId: string) {
    return await this.removeUnauthorized(await this.raw.findById(ruleId))
  }

  async findByRoleId (roleId: string, filter?: TemplateRuleFilter) {
    return await this.removeUnauthorized(await this.raw.findByRoleId(roleId, filter))
  }

  async create (args: CreateTemplateRuleInput) {
    const role = await this.svc(RoleServiceInternal).findById(args.roleId)
    if (!role) throw new Error('Role to be modified does not exist.')
    if (!await this.svc(RoleService).mayCreateRules(role)) throw new Error('You are not permitted to add rules to this role.')
    const newRule = new TemplateRule({ id: '0', roleId: args.roleId, templateId: args.templateId, ...args.grants })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The proposed rule would have more privilege than you currently have, so you cannot create it.')
    try {
      const ruleId = await createTemplateRule(args)
      this.loaders.clear()
      if (!newRule.templateId) await globalTemplateRulesCache.clear()
      const rule = await this.raw.findById(String(ruleId))
      return new TemplateRuleResponse({ success: true, templateRule: rule })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while creating the role.')
    }
  }

  async update (args: UpdateTemplateRuleInput) {
    const rule = await this.raw.findById(args.ruleId)
    if (!rule) throw new Error('Rule to be updated does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to update this template rule.')
    const newRule = new TemplateRule({
      id: '0',
      roleId: rule.roleId,
      siteId: args.templateId ?? rule.templateId,
      grants: { use: args.grants?.use ?? rule.grants.use }
    })
    if (await this.tooPowerful(newRule)) return ValidatedResponse.error('The updated template rule would have more privilege than you currently have, so you cannot update it.')
    try {
      await updateTemplateRule(args)
      this.loaders.clear()
      if (!rule.templateId || !newRule.templateId) await globalTemplateRulesCache.clear()
      const updatedRule = await this.raw.findById(args.ruleId)
      return new TemplateRuleResponse({ templateRule: updatedRule, success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An error occurred while updating the template rule.')
    }
  }

  async delete (ruleId: string) {
    const rule = await this.raw.findById(ruleId)
    if (!rule) throw new Error('Rule to be deleted does not exist.')
    if (!await this.mayWrite(rule)) throw new Error('Current user is not permitted to remove this template rule.')
    try {
      await deleteTemplateRule(ruleId)
      this.loaders.clear()
      if (!rule.templateId) await globalTemplateRulesCache.clear()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      throw new Error('An error occurred while deleting the template rule.')
    }
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

  async mayWrite (rule: TemplateRule) {
    const role = await this.svc(RoleService).findById(rule.id)
    return await this.svc(RoleService).mayUpdate(role!)
  }

  async mayView (rule: TemplateRule) {
    if (await this.haveGlobalPerm('manageAccess')) return true
    const role = await this.svc(RoleServiceInternal).findById(rule.roleId)
    return !!role
  }
}
