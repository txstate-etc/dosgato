import { type APIAnyTemplate, type FulltextGatheringFn, type LinkGatheringFn, type Migration, type ValidationFeedback } from '@dosgato/templating'
import { Context, GQLServer, type GQLStartOpts, gqlDevLogger } from '@txstate-mws/graphql-server'
import { type FastifyInstance } from 'fastify'
import { type FastifyTxStateOptions, prodLogger } from 'fastify-txstate'
import { type GraphQLError, type GraphQLScalarType } from 'graphql'
import { DateTime } from 'luxon'
import { Cache, isNotBlank } from 'txstate-utils'
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
  AssetResizeResolver, compressDownloads, scheduler, DayOfWeek, createPageRoutes, bootstrap, fileHandler,
  FilenameSafeString, FilenameSafeStringScalar, FilenameSafePath, FilenameSafePathScalar, createCommentRoutes,
  SiteServiceInternal, createRole, createPageRule, createAssetRule, addRolesToUser, VersionedService,
  duplicateSite, createUser, systemContext
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
  userLookup?: (userIds: string[]) => Promise<{ firstname: string, lastname: string, email: string, enabled?: boolean, groups?: string[] }[]>
}

export class DGServer {
  protected gqlServer: GQLServer
  public app: FastifyInstance

  constructor (config?: FastifyTxStateOptions) {
    const logger = { ...((process.env.NODE_ENV !== 'development' ? prodLogger : gqlDevLogger)), trace: () => {} }
    this.gqlServer = new GQLServer({ logger, ...config, bodyLimit: 25 * 1024 * 1024 })
    this.app = this.gqlServer.app
  }

  async start (opts: DGStartOpts) {
    for (const template of opts.templates) templateRegistry.register(template)
    templateRegistry.sortMigrations()
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
    if (process.env.DOSGATO_TRAINING_SITES) {
      function trainingSiteName (userId: string, trainingSite: string) {
        return userId + '-' + trainingSite
      }
      const createTrainingSite = new Cache(async (userId: string) => {
        const ctx = systemContext()
        try {
          let user = await ctx.svc(UserServiceInternal).findById(userId)
          if (!user) {
            const details = opts.userLookup ? (await opts.userLookup([userId]))[0] : { firstname: 'Training', lastname: 'User', email: '', enabled: true }
            if (details.enabled !== false) {
              const internalId = await createUser(userId, details.firstname, details.lastname, details.email, true, false)
              user = await ctx.svc(UserServiceInternal).findByInternalId(internalId)
            }
          }
          if (!user || user.disabled || user.system) return
          const trainingSites = process.env.DOSGATO_TRAINING_SITES!.split(',').filter(isNotBlank)
          for (const trainingSite of trainingSites) {
            const tSiteName = trainingSiteName(userId, trainingSite)
            const site = await ctx.svc(SiteServiceInternal).findByName(tSiteName)
            if (site) continue
            const trainingTemplateSite = await ctx.svc(SiteServiceInternal).findByName(trainingSite)
            if (!trainingTemplateSite) continue
            const siteId = await duplicateSite(trainingTemplateSite.id, tSiteName, ctx.svc(VersionedService), userId, ctx)
            // TODO: what if they had a site that got deleted and we are now making a second site for them, but the role is there?
            const roleId = String(await createRole(tSiteName + '-editor'))
            await createPageRule({ roleId, siteId, grants: { create: true, delete: true, move: true, publish: true, unpublish: true, update: true, undelete: false } })
            await createAssetRule({ roleId, siteId, grants: { create: true, delete: true, move: true, update: true, undelete: false } })
            await addRolesToUser([roleId], user.internalId)
          }
        } catch (e: any) {
          if (e.code === 1062) console.warn(`Did not automatically create training site for ${userId} as it appears another server is already doing it.`)
          else console.error(e)
        }
      }, { freshseconds: 12 * 3600 })

      this.app.addHook('onRequest', async req => {
        const ctx = new Context(req)
        await ctx.waitForAuth()
        if (ctx.auth?.sub && ctx.auth.sub !== 'anonymous') await createTrainingSite.get(ctx.auth.sub)
      })
    }

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
        if (ctx.auth.sub === 'anonymous') return false
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
