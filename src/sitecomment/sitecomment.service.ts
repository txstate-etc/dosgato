import { BaseService } from '@txstate-mws/graphql-server'
import {
  DosGatoService, type SiteComment, type SiteCommentFilter, getSiteComments, SiteServiceInternal,
  createSiteComment, SiteCommentResponse, SiteService
} from '../internal.js'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'

const CommentsByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
    return await getSiteComments({ ids })
  }
})

const CommentsBySiteIdLoader = new OneToManyLoader({
  fetch: async (siteIds: string[]) => {
    return await getSiteComments({ siteIds })
  },
  extractKey: (c: SiteComment) => c.siteId,
  idLoader: CommentsByIdLoader
})

export class SiteCommentServiceInternal extends BaseService {
  async find (filter?: SiteCommentFilter) {
    return await getSiteComments(filter)
  }

  async findById (id: string) {
    return await this.loaders.get(CommentsByIdLoader).load(id)
  }

  async findBySiteId (siteId: string) {
    return await this.loaders.get(CommentsBySiteIdLoader).load(siteId)
  }
}

export class SiteCommentService extends DosGatoService<SiteComment> {
  raw = this.svc(SiteCommentServiceInternal)

  mayView (siteComment: SiteComment) {
    return this.svc(SiteService).mayViewForEdit({ id: siteComment.siteId })
  }

  async find (filter?: SiteCommentFilter) {
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findBySiteId (siteId: string) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId))
  }

  async create (siteId: string, comment: string) {
    const site = await this.svc(SiteServiceInternal).findById(siteId)
    if (!site) throw new Error('Site does not exist')
    const response = new SiteCommentResponse({ success: true })
    const commentId = await createSiteComment(siteId, comment, this.ctx.authInfo.user!.internalId)
    response.siteComment = await this.raw.findById(String(commentId))
    return response
  }
}
