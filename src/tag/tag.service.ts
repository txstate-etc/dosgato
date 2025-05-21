import { BaseService, ValidatedResponse, type Context } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ParentDocumentLoader } from 'dataloader-factory'
import { DataServiceInternal, type Page, PageResponse, PageService, PageServiceInternal, PagesResponse, type UserTag, UserTagGroup, VersionedService } from '../internal.js'
import { addUserTags, getPageTagIds, getTagPageIds, removeUserTags, replaceUserTags } from './tag.database.js'

export const tagIdsByPageIdLoader = new OneToManyLoader({
  fetch: async (pageIds: number[]) => await getPageTagIds(pageIds),
  extractKey: row => row.pageId
})

export const groupByTagIdLoader = new ParentDocumentLoader({
  fetch: async (tagIds: string[], ctx: Context) => {
    const dataSvc = ctx.svc(DataServiceInternal)
    const groupIds = await ctx.svc(VersionedService).find([{ indexName: 'dg_tag', in: tagIds }])
    const groups = await dataSvc.findByIds(groupIds)
    const data = await Promise.all(groups.map(async g => await dataSvc.getData(g)))
    return groups.map((g, i) => new UserTagGroup(data[i], g))
  },
  childIds: group => group.tags.map(t => t.id)
})

export class TagServiceInternal extends BaseService {
  async findGroupsByTagIds (tagIds: string[]) {
    return await this.loaders.loadMany(groupByTagIdLoader, tagIds)
  }

  async findGroupByTagId (tagId: string) {
    return await this.loaders.get(groupByTagIdLoader).load(tagId)
  }

  async findTagsByPage (page: Page, includeDisabled?: boolean, includeInternal?: boolean) {
    const tagIds = await this.loaders.get(tagIdsByPageIdLoader).load(page.internalId)
    const tagSet = new Set(tagIds.map(t => t.tagId))
    const groups = await this.loaders.loadMany(groupByTagIdLoader, Array.from(tagSet))
    const ret: UserTag[] = []
    for (const g of groups) {
      if ((g.disabled && !includeDisabled) || (g.internal && !includeInternal)) continue
      for (const t of g.tags) {
        if (tagSet.has(t.id) && (!t.disabled || includeDisabled)) ret.push(t)
      }
    }
    return ret
  }
}

export class TagService extends TagServiceInternal {
  async addTagsToPages (tagIds: string[], pageDataIds: string[]) {
    const pages = await this.svc(PageServiceInternal).findByIds(pageDataIds)
    const pageSvc = this.svc(PageService)
    if (pages.some(p => !pageSvc.mayUpdate(p))) throw new Error('You are not authorized to edit all of the selected pages.')
    await addUserTags(tagIds, pages.map(p => p.internalId))
    this.loaders.clear()
    return new PagesResponse({ success: true, pages })
  }

  async removeTagsFromPages (tagIds: string[], pageDataIds: string[]) {
    const pages = await this.svc(PageServiceInternal).findByIds(pageDataIds)
    const pageSvc = this.svc(PageService)
    if (pages.some(p => !pageSvc.mayUpdate(p))) throw new Error('You are not authorized to edit all of the selected pages.')
    await removeUserTags(tagIds, pages.map(p => p.internalId))
    this.loaders.clear()
    return new PagesResponse({ success: true, pages })
  }

  async setPageTags (tagIds: string[], pageDataIds: string[], includeChildren?: boolean) {
    const pages = await this.svc(PageServiceInternal).findByIds(pageDataIds)
    const pageSvc = this.svc(PageService)
    if (pages.some(p => !pageSvc.mayUpdate(p))) throw new Error('You are not authorized to edit all of the selected pages.')
    await replaceUserTags(tagIds, pages.map(p => p.internalId), includeChildren)
    this.loaders.clear()
    return new PagesResponse({ success: true, pages })
  }
}
