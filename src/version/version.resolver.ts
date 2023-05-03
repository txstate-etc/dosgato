import { Context, UnimplementedError } from '@txstate-mws/graphql-server'
import { Arg, Ctx, FieldResolver, ID, Int, Mutation, Resolver, Root } from 'type-graphql'
import { JsonData, User, UserService, ObjectVersion, VersionedService, VersionResponse, PageService, PageServiceInternal, AssetServiceInternal, DataServiceInternal, AssetService, DataService } from '../internal.js'

@Resolver(of => ObjectVersion)
export class VersionResolver {
  @FieldResolver(returns => User, { description: 'The user whose action created this version.' })
  async user (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    return await ctx.svc(UserService).findById(version.userId)
  }

  @FieldResolver(returns => JsonData, { description: 'The full JSON object as it was when this version was recorded.' })
  async data (@Ctx() ctx: Context, @Root() version: ObjectVersion) {
    const versioned = await ctx.svc(VersionedService).get(version.id, { version: version.version })
    return versioned!.data
  }

  @Mutation(returns => VersionResponse, { description: 'Allows an editor to mark or unmark a version as significant or important. Marking a version does NOT protect it from being deleted by retention policy.' })
  async versionToggleMarked (@Ctx() ctx: Context, @Arg('dataId', type => ID, { description: 'This could be the dataId for anything versionable, i.e. an asset, page, or data entry.' }) dataId: string, @Arg('version', type => Int) version: number) {
    const intDataId = Number(dataId)
    const [page, asset, data] = await Promise.all([
      ctx.svc(PageServiceInternal).findById(dataId),
      ctx.svc(AssetServiceInternal).findById(dataId),
      ctx.svc(DataServiceInternal).findById(dataId)
    ])
    if (!page && !asset && !data) throw new Error('Specified dataId could not be found.')
    if (
      (page && !await ctx.svc(PageService).mayUpdate(page)) ||
      (asset && !await ctx.svc(AssetService).mayUpdate(asset)) ||
      (data && !await ctx.svc(DataService).mayUpdate(data))
    ) throw new Error('You are not allowed to mark or unmark this version.')
    const vSvc = ctx.svc(VersionedService)
    await vSvc.toggleMarked(intDataId, version)
    const [versioned, tags] = await Promise.all([
      vSvc.getMeta(intDataId, { version }),
      vSvc.getTags(intDataId, version)
    ])
    if (!versioned) throw new Error('Specified dataId and version combination could not be found.')
    const versionObj = new ObjectVersion({
      id: versioned.id,
      version: versioned.version,
      date: versioned.modified,
      comment: versioned.comment,
      tags: tags.map(t => t.tag),
      user: versioned.modifiedBy,
      markedAt: versioned.markedAt
    })
    return new VersionResponse({ success: true, version: versionObj })
  }
}
