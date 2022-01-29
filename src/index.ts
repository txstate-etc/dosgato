/* eslint-disable import/first */
import { install } from 'source-map-support'
install()
import { GQLServer } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { migrations } from './migrations'
import {
  DateTimeScalar, UrlSafeString, UrlSafeStringScalar,
  AssetPermissionsResolver, AssetResolver,
  AssetRuleResolver, AssetRulePermissionsResolver,
  DataPermissionsResolver, DataResolver,
  DataRuleResolver, DataRulePermissionsResolver,
  AssetFolderResolver, AssetFolderPermissionsResolver,
  PagePermissionsResolver, PageResolver,
  PageRulePermissionsResolver, PageRuleResolver,
  PagetreePermissionsResolver, PagetreeResolver,
  RolePermissionsResolver, RoleResolver,
  SitePermissionsResolver, SiteResolver,
  SiteRulePermissionsResolver, SiteRuleResolver,
  TemplateAreaResolver, TemplatePermissionsResolver, TemplateResolver,
  UserPermissionsResolver, UserResolver,
  DataFolderPermissionsResolver, DataFolderResolver,
  GroupPermissionsResolver, GroupResolver,
  GlobalRulePermissionsResolver, GlobalRuleResolver,
  VersionResolver, OrganizationResolver,
  AccessResolver,
  TemplateRulePermissionsResolver, TemplateRuleResolver,
  logMutation
} from 'internal'

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
      TemplateAreaResolver,
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
    ],
    after: logMutation
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
