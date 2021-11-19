import { GQLServer } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { migrations } from './migrations'
import { AssetPermissionsResolver, AssetResolver } from './asset'
import { AssetRuleResolver, AssetRulePermissionsResolver } from './assetrule'
import { DataPermissionsResolver, DataResolver } from './data'
import { DataRuleResolver, DataRulePermissionsResolver } from './datarule'
import { AssetFolderResolver, AssetFolderPermissionsResolver } from './assetfolder'
import { PagePermissionsResolver, PageResolver } from './page'
import { PageRulePermissionsResolver, PageRuleResolver } from './pagerule'
import { PagetreePermissionsResolver, PagetreeResolver } from './pagetree'
import { RolePermissionsResolver, RoleResolver } from './role'
import { DateTimeScalar } from './scalars/datetime'
import { UrlSafeString, UrlSafeStringScalar } from './scalars/urlsafestring'
import { SitePermissionsResolver, SiteResolver } from './site'
import { SiteRulePermissionsResolver, SiteRuleResolver } from './siterule'
import { TemplatePermissionsResolver, TemplateResolver } from './template'
import { UserPermissionsResolver, UserResolver } from './user'
import { DataFolderPermissionsResolver, DataFolderResolver } from './datafolder'
import { GroupPermissionsResolver, GroupResolver } from './group'
import { GlobalRulePermissionsResolver, GlobalRuleResolver } from './globalrule/globalrule.resolver'
import { VersionResolver } from './version'
import { OrganizationResolver } from './organization/organization.resolver'
import { AccessResolver } from './access'
import { TemplateRulePermissionsResolver, TemplateRuleResolver } from './templaterule'

async function main () {
  await migrations()
  const server = new GQLServer()
  await server.start({
    resolvers: [
      AccessResolver,
      AssetResolver,
      AssetPermissionsResolver,
      AssetRuleResolver,
      AssetRulePermissionsResolver,
      AssetFolderResolver,
      AssetFolderPermissionsResolver,
      DataResolver,
      DataPermissionsResolver,
      DataRuleResolver,
      DataRulePermissionsResolver,
      DataFolderResolver,
      DataFolderPermissionsResolver,
      GlobalRuleResolver,
      GlobalRulePermissionsResolver,
      GroupResolver,
      GroupPermissionsResolver,
      OrganizationResolver,
      PageResolver,
      PagePermissionsResolver,
      PageRuleResolver,
      PageRulePermissionsResolver,
      PagetreeResolver,
      PagetreePermissionsResolver,
      RoleResolver,
      RolePermissionsResolver,
      SiteResolver,
      SitePermissionsResolver,
      SiteRuleResolver,
      SiteRulePermissionsResolver,
      TemplateResolver,
      TemplatePermissionsResolver,
      TemplateRuleResolver,
      TemplateRulePermissionsResolver,
      UserResolver,
      UserPermissionsResolver,
      VersionResolver
    ],
    scalarsMap: [
      { type: UrlSafeString, scalar: UrlSafeStringScalar },
      { type: DateTime, scalar: DateTimeScalar }
    ]
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
