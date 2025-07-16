import { BaseService, type Context } from '@txstate-mws/graphql-server'
import { OneToManyLoader, ParentDocumentLoader } from 'dataloader-factory'
import { Cache } from 'txstate-utils'
import { addUserTags, getPageTagsByPageIds, removeUserTags, replaceUserTags, DataServiceInternal, type Page, PageService, PageServiceInternal, PagesResponse, type UserTag, UserTagGroup, VersionedService } from '../internal.js'

export const tagIdsByPageIdLoader = new OneToManyLoader({
  fetch: async (pageIds: number[]) => await getPageTagsByPageIds(pageIds),
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

const tagNameCache = new Cache(async (_: any, ctx: Context) => {
  const dataSvc = ctx.svc(DataServiceInternal)
  const dataGroups = await dataSvc.findByTemplate('dosgato-core-tags')
  const data = await Promise.all(dataGroups.map(async g => await dataSvc.getData(g)))
  const groups = dataGroups.map((g, i) => new UserTagGroup(data[i], g))
  const tagsByName: Record<string, string[]> = {}
  const tagIds = new Set<string>()
  for (const group of groups) {
    if (group.disabled) continue
    for (const tag of group.tags) {
      if (tag.disabled) continue
      const lcName = tag.name.toLocaleLowerCase()
      tagsByName[lcName] ??= []
      tagsByName[lcName].push(tag.id)
      tagIds.add(tag.id)
    }
  }
  return { tagsByName, tagIds }
})

export class TagServiceInternal extends BaseService {
  async findGroupsByTagIds (tagIds: string[]) {
    return await this.loaders.loadMany(groupByTagIdLoader, tagIds)
  }

  async findGroupByTagId (tagId: string) {
    return await this.loaders.get(groupByTagIdLoader).load(tagId)
  }

  async findTagIdsByTagNamesOrIds (tagNamesOrIds: string[]) {
    const { tagsByName, tagIds } = await tagNameCache.get(undefined, this.ctx)
    const tagNamesLc = tagNamesOrIds.filter(t => !tagIds.has(t)).map(t => t.toLocaleLowerCase())
    const alreadyIds = tagNamesOrIds.filter(t => tagIds.has(t))
    return [...alreadyIds, ...tagNamesLc.flatMap(name => tagsByName[name] ?? [])]
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
