import { GQLServer } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { AssetPermissionsResolver, AssetResolver } from './asset'
import { AssetRuleResolver, AssetRulePermissionsResolver } from './assetrule'
import { FolderResolver, FolderPermissionsResolver } from './folder'
import { PagePermissionsResolver, PageResolver } from './page'
import { PageRulePermissionsResolver, PageRuleResolver } from './pagerule'
import { PageTreePermissionsResolver, PageTreeResolver } from './pagetree'
import { RoleResolver } from './role'
import { DateTimeScalar } from './scalars/datetime'
import { UrlSafeString, UrlSafeStringScalar } from './scalars/urlsafestring'
import { SitePermissionsResolver, SiteResolver } from './site'
import { UserResolver } from './user'

async function main () {
  const server = new GQLServer()
  await server.start({
    resolvers: [
      AssetResolver,
      AssetPermissionsResolver,
      AssetRuleResolver,
      AssetRulePermissionsResolver,
      FolderResolver,
      FolderPermissionsResolver,
      PageResolver,
      PagePermissionsResolver,
      PageRuleResolver,
      PageRulePermissionsResolver,
      PageTreeResolver,
      PageTreePermissionsResolver,
      RoleResolver,
      SiteResolver,
      SitePermissionsResolver,
      UserResolver
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
