import { type APIAnyTemplate, type FulltextGatheringFn, type LinkGatheringFn, type Migration, type ValidationFeedback } from '@dosgato/templating'
import { type Context, GQLServer, type GQLStartOpts } from '@txstate-mws/graphql-server'
import { type FastifyInstance } from 'fastify'
import { type FastifyTxStateOptions, devLogger } from 'fastify-txstate'
import { type GraphQLError, type GraphQLScalarType } from 'graphql'
import { DateTime } from 'luxon'
import { Cache } from 'txstate-utils'
import { type NonEmptyArray } from 'type-graphql'
import { migrations, resetdb } from './migrations.js'
import {
  DateTimeScalar, UrlSafeString, UrlSafeStringScalar, AssetPermissionsResolver, AssetResolver,
  AssetRuleResolver, AssetRulePermissionsResolver, DataPermissionsResolver, DataResolver,
  DataRuleResolver, DataRulePermissionsResolver, AssetFolderResolver, AssetFolderPermissionsResolver,
  PagePermissionsResolver, PageResolver, PageRulePermissionsResolver, PageRuleResolver,
  PagetreePermissionsResolver, PagetreeResolver, RolePermissionsResolver, RoleResolver,
  SitePermissionsResolver, SiteResolver, SiteCommentResolver, SiteRulePermissionsResolver, SiteRuleResolver,
  TemplateAreaResolver, TemplatePermissionsResolver, TemplateResolver, UserPermissionsResolver, UserResolver,
  DataFolderPermissionsResolver, DataFolderResolver, GroupPermissionsResolver, GroupResolver,
  GlobalRulePermissionsResolver, GlobalRuleResolver, VersionResolver, OrganizationResolver,
  AccessResolver, type DBMigration, TemplateRulePermissionsResolver, TemplateRuleResolver,
  logMutation, templateRegistry, syncRegistryWithDB, UserServiceInternal, DataRootResolver,
  DataRootPermissionsResolver, updateLastLogin, createAssetRoutes, UrlSafePath, UrlSafePathScalar,
  AssetResizeResolver, compressDownloads, scheduler, DayOfWeek, createPageRoutes, bootstrap, fileHandler, beginProcessingResizes, FilenameSafeString, FilenameSafeStringScalar, FilenameSafePath, FilenameSafePathScalar, SchemaVersionScalar, SchemaVersion, createCommentRoutes
} from './internal.js'

const loginCache = new Cache(async (userId: string, tokenIssuedAt: number) => {
  await updateLastLogin(userId, tokenIssuedAt)
})

async function updateLogin (queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors?: GraphQLError[]) {
  await loginCache.get(auth.sub, Number(auth.iat))
}

export interface AssetMeta <DataType = any> {
  validation: (data: DataType, extras: { path: string }) => Promise<ValidationFeedback[]>
  migrations: Migration<any, { path: string }>[]
  getLinks: LinkGatheringFn<DataType>
  getFulltext: FulltextGatheringFn<DataType>
}

export interface DGStartOpts extends Omit<GQLStartOpts, 'resolvers'> {
  templates: APIAnyTemplate[]
  fixtures?: () => Promise<void>
  migrations?: DBMigration[]
  resolvers?: any[]
  assetMeta?: AssetMeta
}

export class DGServer {
  protected gqlServer: GQLServer
  public app: FastifyInstance

  constructor (config?: FastifyTxStateOptions) {
    this.gqlServer = new GQLServer({ ...config, logger: { ...devLogger, trace: () => {} }, bodyLimit: 10 * 1024 * 1024 })
    this.app = this.gqlServer.app
  }

  async start (opts: DGStartOpts) {
    for (const template of opts.templates) templateRegistry.register(template)
    const shouldResetDb = process.env.NODE_ENV === 'development' && process.env.RESET_DB_ON_STARTUP === 'true'

    if (shouldResetDb) await resetdb()
    await migrations(opts.migrations)

    // sync templates with database
    await syncRegistryWithDB()

    await fileHandler.init()
    if (shouldResetDb && process.env.SKIP_FIXTURES !== 'true') {
      console.info('running fixtures')
      await opts.fixtures?.()
      if (process.env.SKIP_BOOTSTRAP !== 'true') {
        console.info('importing bootstrap files')
        await bootstrap()
      }
      console.info('finished fixtures')
    }

    await createAssetRoutes(this.app)
    await createPageRoutes(this.app)
    await createCommentRoutes(this.app)

    const resolvers: NonEmptyArray<any> = [
      AccessResolver,
      AssetResolver,
      AssetPermissionsResolver,
      AssetResizeResolver,
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
      SiteCommentResolver,
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

    const scalarsMap: { type: any, scalar: GraphQLScalarType }[] = [
      { type: FilenameSafePath, scalar: FilenameSafePathScalar },
      { type: FilenameSafeString, scalar: FilenameSafeStringScalar },
      { type: UrlSafePath, scalar: UrlSafePathScalar },
      { type: UrlSafeString, scalar: UrlSafeStringScalar },
      { type: DateTime, scalar: DateTimeScalar }
    ]
    scalarsMap.push(...(opts.scalarsMap ?? []))

    const after = async (...args: [queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors: GraphQLError[] | undefined]) => {
      await Promise.all([
        opts.after?.(...args),
        logMutation(...args),
        updateLogin(...args)
      ])
    }

    await scheduler.schedule('compressDownloads', compressDownloads, { duringHour: 5, duringDayOfWeek: DayOfWeek.TUESDAY })

    await this.gqlServer.start({
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
    beginProcessingResizes().catch(console.error)
  }
}

export * from './internal.js'
