/* eslint-disable import/first */
import { install } from 'source-map-support'
install()
import { Context, GQLServer, AuthError } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import multipart from 'fastify-multipart'
import { promises as fsp } from 'fs'
import { migrations } from './migrations'
import { fixtures } from './fixtures'
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
  logMutation, handleUpload, templateRegistry, syncRegistryWithDB
} from 'internal'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData } from 'fixturetemplates'

async function main () {
  // register some templates
  // in the future we will take the templates as input, but for now we just need test components
  templateRegistry.register(PageTemplate1)
  templateRegistry.register(PageTemplate2)
  templateRegistry.register(PageTemplate3)
  templateRegistry.register(PageTemplate4)
  templateRegistry.register(LinkComponent)
  templateRegistry.register(PanelComponent)
  templateRegistry.register(QuoteComponent)
  templateRegistry.register(ColorData)
  templateRegistry.register(BuildingData)
  templateRegistry.register(ArticleData)

  await migrations()

  // sync templates with database
  await syncRegistryWithDB()

  if (process.env.NODE_ENV === 'development' && process.env.RESET_DB_ON_STARTUP === 'true') {
    await fixtures()
  }

  const server = new GQLServer()
  await server.app.register(multipart)
  await fsp.mkdir('/files/tmp', { recursive: true })
  server.app.post('/files', async (req, res) => {
    const ctx = new Context(req)
    await ctx.waitForAuth()
    if (!ctx.auth?.sub) throw new AuthError()
    const files = await handleUpload(req, res)
    return files
  })
  // TODO: Add endpoint for getting assets. /assets/:id or /files/:id
  await server.start({
    send401: true,
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
