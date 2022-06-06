import multipart from '@fastify/multipart'
import { APITemplate } from '@dosgato/templating'
import { Context, GQLServer, AuthError, GQLStartOpts } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { FastifyInstance } from 'fastify'
import { FastifyTxStateOptions } from 'fastify-txstate'
import { promises as fsp } from 'fs'
import { GraphQLScalarType } from 'graphql'
import { NonEmptyArray } from 'type-graphql'
import { migrations } from './migrations.js'
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
  AccessResolver, DBMigration,
  TemplateRulePermissionsResolver, TemplateRuleResolver,
  logMutation, handleUpload, templateRegistry, syncRegistryWithDB, UserServiceInternal, DataRootResolver, DataRootPermissionsResolver
} from './internal.js'

async function getEnabledUser (ctx: Context) {
  await ctx.waitForAuth()
  if (!ctx.auth?.sub) throw new AuthError()
  const user = await ctx.svc(UserServiceInternal).findById(ctx.auth.sub)
  if (!user || user.disabled) throw new AuthError()
  return user
}

export interface DGStartOpts extends Omit<GQLStartOpts, 'resolvers'> {
  templates: APITemplate[]
  fixtures?: () => Promise<void>
  migrations?: DBMigration[]
  resolvers?: Function[]
}

export class DGServer {
  protected gqlServer: GQLServer
  public app: FastifyInstance

  constructor (config?: FastifyTxStateOptions) {
    this.gqlServer = new GQLServer(config)
    this.app = this.gqlServer.app
  }

  async start (opts: DGStartOpts) {
    for (const template of opts.templates) templateRegistry.register(template)

    await migrations(opts.migrations)

    // sync templates with database
    await syncRegistryWithDB()

    if (process.env.NODE_ENV === 'development' && process.env.RESET_DB_ON_STARTUP === 'true') {
      await opts.fixtures?.()
    }

    // TODO: Add endpoint for getting assets. /assets/:id or /files/:id
    await this.app.register(multipart)
    await fsp.mkdir('/files/tmp', { recursive: true })
    this.app.post('/files', async (req, res) => {
      const ctx = new Context(req)
      await getEnabledUser(ctx) // throws if not authorized
      const files = await handleUpload(req, res)
      return files
    })

    const resolvers: NonEmptyArray<Function> = [
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
      DataRootResolver,
      DataRootPermissionsResolver,
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
    ];
    (resolvers as any[]).push(...(opts.resolvers ?? []))

    const scalarsMap: { type: Function, scalar: GraphQLScalarType }[] = [
      { type: UrlSafeString, scalar: UrlSafeStringScalar },
      { type: DateTime, scalar: DateTimeScalar }
    ]
    scalarsMap.push(...(opts.scalarsMap ?? []))

    const after = async (...args: [queryTime: number, operationName: string, query: string, auth: any, variables: any]) => {
      await Promise.all([
        opts.after?.(...args),
        logMutation(...args)
      ])
    }
    return await this.gqlServer.start({
      ...opts,
      send401: true,
      send403: async (ctx: Context) => {
        if (!ctx.auth?.sub) return true
        const user = await ctx.svc(UserServiceInternal).findById(ctx.auth?.sub)
        return !user || user.disabled
      },
      resolvers,
      scalarsMap,
      after
    })
  }
}

export * from './internal.js'
