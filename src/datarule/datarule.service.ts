import { AuthorizedService } from '@txstate-mws/graphql-server'
import { OneToManyLoader } from 'dataloader-factory'
import { getDataRules } from './datarule.database'
import { DataRule } from './datarule.model'

const dataRulesByRoleLoader = new OneToManyLoader({
  fetch: async (roleIds: string[]) => {
    return await getDataRules(roleIds)
  },
  extractKey: (r: DataRule) => r.roleId
})

export class DataRuleService extends AuthorizedService {
  async findByRoleId (roleId: string) {
    return await this.loaders.get(dataRulesByRoleLoader).load(roleId)
  }

  async mayView (): Promise<boolean> {
    return true
  }
}
