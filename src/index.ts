import type { APIAnyTemplate, FulltextGatheringFn, LinkGatheringFn, Migration, ValidationFeedback } from '@dosgato/templating'
import { GQLServer, type GQLStartOpts, gqlDevLogger, Context } from '@txstate-mws/graphql-server'
import { type FastifyInstance } from 'fastify'
import { type FastifyTxStateOptions, prodLogger } from 'fastify-txstate'
import { type GraphQLError, type GraphQLScalarType } from 'graphql'
import { DateTime } from 'luxon'
import { Cache, isBlank, isNotBlank, omit } from 'txstate-utils'
import { type NonEmptyArray } from 'type-graphql'
import { migrations, resetdb } from './migrations.js'
import {
  DateTimeScalar, UrlSafeString, UrlSafeStringScalar, AssetPermissionsResolver, AssetResolver,
  AssetRuleResolver, AssetRulePermissionsResolver, DataPermissionsResolver, DataResolver,
  DataRuleResolver, DataRulePermissionsResolver, AssetFolderResolver, AssetFolderPermissionsResolver,
  PagePermissionsResolver, PageResolver, PageRulePermissionsResolver, PageRuleResolver,
  PagetreePermissionsResolver, PagetreeResolver, PagetreeType, RolePermissionsResolver, RoleResolver,
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
  duplicateSite, createUser, systemContext, UserService, type Role, type DGContext,
  type DGRestrictOperations, dgContextMixin, createUserRoutes, syncUsers, type EventInfo, makeSafe,
  tagTemplate, UserTagResolver, TemplateService, TemplateServiceInternal, PagetreeServiceInternal,
  RoleServiceInternal, PageInformationResolver
} from './internal.js'

const loginCache = new Cache(async (userId: string, tokenIssuedAt: number) => {
  await updateLastLogin(userId, tokenIssuedAt)
})

async function updateLogin (queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors: GraphQLError[] | undefined, ctx: Context) {
  await loginCache.get(auth.sub ?? auth.client_id, Number(auth.iat))
}

export interface AssetMeta <DataType = any> {
  validation?: (data: DataType, extras: { path: string }) => Promise<ValidationFeedback[]>
  migrations?: Migration<any, { path: string }>[]
  getLinks?: LinkGatheringFn<DataType>
  getFulltext?: FulltextGatheringFn<DataType>
}

export interface DGUser {
  login: string
  firstname: string
  lastname: string
  email: string
  enabled?: boolean
  groups?: string[]
}

export interface DGStartOpts extends Omit<GQLStartOpts, 'resolvers'> {
  templates: APIAnyTemplate[]
  fixtures?: () => Promise<void>
  migrations?: DBMigration[]
  resolvers?: any[]
  assetMeta?: AssetMeta
  /**
   * Provide a function that can look up users in your IdM.
   *
   * Return object should be a map of input strings and results. For instance, if we are batching two
   * searches the input might be ['john.smith', 'jane.williams'] and the return should be
   * { 'john.smith': { ... John's details ... }, 'jane.williams': { ... Jane's details ... } }
   *
   * It's the responsibility of the implementation to do the work as efficiently as it can.
   */
  userLookup?: (logins: string[]) => Promise<Record<string, DGUser | undefined>>
  /**
   * Provide a function that can search for users
   *
   * This will be connected to the admin UI so that you can search your IdM for users when creating
   * a Dos Gato user. Login, name and email will be fetched automatically instead of making the administrator
   * type it all out.
   *
   * If this function is not provided, userLookup will be used instead (meaning only full logins will show results).
   * If neither is provided, the feature will be disabled.
   */
  userSearch?: (search: string) => Promise<DGUser[]>
  /**
   * Provide a function to protect certain pages from being deleted, unpublished, moved, renamed, or having their template
   * changed. Editing and publishing are unaffected, and creating/copying/importing is possible
   * unless the path already exists.
   *
   * This is useful if you want to ensure that sites maintain mandatory pages like /404 or /sitemap, but you
   * want editors to have freedom to customize those pages.
   *
   * Return true if the given operation should be blocked. 'into' means that a page is being created
   * or moved underneath the page.
   *
   * Blocking an operation will mean that even a system administrator will be unable to complete the operation, so be
   * sure to inspect the `roles` array if you want to allow operations for superuser or other roles (by name).
   */
  restrictPageOperation?: (page: { id: string, name: string, path: string, templateKey: string, pagetreeType: PagetreeType }, operation: DGRestrictOperations, roles: Role[]) => boolean
  /**
   * Provide a function to receive live events from the API.
   *
   * This is useful for setting up real-time syncing with other systems.
   *
   * This first version only includes an event for publishing a page, for real-time cache invalidation.
   *
   * Your function will be inside a try/catch so as not to interrupt regular operation.
   */
  onEvent?: (info: EventInfo) => void | Promise<void>
}

export class DGServer {
  protected gqlServer: GQLServer
  public app: FastifyInstance

  constructor (config?: FastifyTxStateOptions) {
    const logger = process.env.NODE_ENV !== 'development' ? prodLogger : { ...gqlDevLogger, trace: () => {} }
    this.gqlServer = new GQLServer({ logger, ...config, bodyLimit: 25 * 1024 * 1024 })
    this.app = this.gqlServer.app
  }

  async start (opts: DGStartOpts) {
    templateRegistry.serverConfig = { ...omit(opts, 'templates'), customContext: dgContextMixin(opts.customContext ?? Context) }
    for (const template of opts.templates) templateRegistry.register(template)
    templateRegistry.register(tagTemplate)
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
    await createUserRoutes(this.app)
    this.app.get<{ Querystring: { q: string } }>('/usersearch', async (req, res) => {
      if ((!opts.userLookup && !opts.userSearch) || isBlank(req.query.q)) return []
      return (opts.userSearch
        ? await opts.userSearch(req.query.q)
        : await opts.userLookup!([req.query.q])) ?? []
    })
    if (process.env.DOSGATO_TRAINING_SITES) {
      function trainingSiteName (userId: string, trainingSite: string) {
        return makeSafe(userId + '-' + trainingSite)
      }
      const createTrainingSite = new Cache(async (userId: string) => {
        if (isBlank(userId) || ['anonymous', 'render'].includes(userId)) return
        const ctx = await systemContext()
        try {
          let user = await ctx.svc(UserServiceInternal).findById(userId)
          if (!user) {
            const details = (opts.userLookup ? (await opts.userLookup([userId]))[userId] : undefined) ?? { firstname: 'Training', lastname: 'User', email: '', enabled: true }
            if (details.enabled !== false) {
              const internalId = await createUser(userId, details.firstname, details.lastname, details.email, [], false)
              user = await ctx.svc(UserServiceInternal).findByInternalId(internalId)
            }
          }
          if (!user || user.disabled || user.system) return
          const trainingSites = process.env.DOSGATO_TRAINING_SITES!.split(',').filter(isNotBlank)
          for (const trainingSite of trainingSites) {
            const tSiteName = trainingSiteName(userId, trainingSite)
            const site = await ctx.svc(SiteServiceInternal).findByName(tSiteName)
            const trainingTemplateSite = await ctx.svc(SiteServiceInternal).findByName(trainingSite)
            if (!trainingTemplateSite) continue
            const [trainingTemplatePagetree] = await ctx.svc(PagetreeServiceInternal).findBySiteId(trainingTemplateSite.id, { types: [PagetreeType.PRIMARY] })

            const siteId = site?.id ?? await duplicateSite(trainingTemplateSite.id, tSiteName, ctx.svc(VersionedService), userId, ctx)

            const [approvedTemplatesTarget, approvedTemplatesPagetreeTarget, approvedTemplatesActual] = await Promise.all([
              ctx.svc(TemplateServiceInternal).findBySiteId(trainingTemplateSite.id),
              ctx.svc(TemplateServiceInternal).findByPagetreeId(trainingTemplatePagetree.id),
              ctx.svc(TemplateServiceInternal).findBySiteId(siteId)
            ])
            const approvedTemplateKeysActual = new Set(approvedTemplatesActual.map(t => t.key))
            const approvedTemplateKeysTarget = new Set(approvedTemplatesTarget.map(t => t.key).concat(approvedTemplatesPagetreeTarget.map(t => t.key)))
            const templatesToAdd = [...approvedTemplateKeysTarget].filter(k => !approvedTemplateKeysActual.has(k))
            const templatesToRemove = [...approvedTemplateKeysActual].filter(k => !approvedTemplateKeysTarget.has(k))
            for (const tKey of templatesToAdd) {
              await ctx.svc(TemplateService).authorizeForSite(tKey, siteId)
            }
            for (const tKey of templatesToRemove) {
              await ctx.svc(TemplateService).deauthorizeTemplate(tKey, siteId)
            }

            const [role] = await ctx.svc(RoleServiceInternal).find({ names: [tSiteName + '-editor'] })
            // we can skip creating roles and rules if the role already exists
            if (role != null) continue

            const roleId = String(await createRole({ name: tSiteName + '-editor' }))
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
        const ctx = templateRegistry.getCtx(req)
        await ctx.waitForAuth()
        await createTrainingSite.get(ctx.svc(UserService).login)
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
      PageInformationResolver,
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
      UserTagResolver,
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

    const after = async (...args: [queryTime: number, operationName: string, query: string, auth: any, variables: any, data: any, errors: GraphQLError[] | undefined, ctx: Context]) => {
      await Promise.all([
        opts.after?.(...args),
        logMutation(...args),
        updateLogin(...args)
      ])
    }

    await scheduler.schedule('compressDownloads', compressDownloads, { duringHour: 5, duringDayOfWeek: DayOfWeek.TUESDAY })
    if (templateRegistry.serverConfig.userLookup) await scheduler.schedule('syncUsers', syncUsers, { duringHour: 4 })
    await this.gqlServer.start({
      ...opts,
      customContext: templateRegistry.serverConfig.customContext,
      send401: true,
      send403: async (ctx: Context) => {
        const dgCtx = ctx as DGContext
        if (['anonymous', 'render'].includes(dgCtx.login)) return false
        const user = dgCtx.authInfo.user
        return (!user || user.disabled)
      },
      resolvers,
      scalarsMap,
      after
    })
  }
}

export * from './internal.js'
