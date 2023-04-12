import { intersect, isNotNull, keyby } from 'txstate-utils'
import { type DataFolder, DataRoot, type DataRootFilter, DosGatoService, type Site, SiteServiceInternal, type Template, TemplateService, TemplateType } from '../internal.js'

export class DataRootService extends DosGatoService<DataRoot> {
  templatesById?: Map<string, Template>
  templatesByKey?: Map<string, Template>
  allSites?: Site[]

  async find (filter?: DataRootFilter) {
    const siteService = this.svc(SiteServiceInternal)
    this.templatesById ??= (await this.svc(TemplateService).find({ types: [TemplateType.DATA] })).reduce((map, template) => map.set(template.id, template), new Map())
    this.templatesByKey ??= Array.from(this.templatesById.values()).reduce((map, template) => map.set(template.key, template), new Map())
    filter ??= {}
    const idPairs = (filter.ids ?? []).map(id => {
      const [siteId, templateId] = id.split('-')
      return { siteId: siteId === 'global' ? undefined : siteId, templateId }
    })
    filter.templateIds = intersect({ skipEmpty: true }, filter.templateIds, idPairs.map(p => p.templateId))
    filter.templateKeys = intersect({ skipEmpty: true }, filter.templateKeys, filter.templateIds?.map(tid => this.templatesById!.get(tid)?.key).filter(isNotNull))
    filter.siteIds = intersect({ skipEmpty: true }, filter.siteIds, idPairs.map(p => p.siteId).filter(isNotNull))

    const templates = filter.templateKeys.length
      ? filter.templateKeys.map(k => this.templatesByKey!.get(k)).filter(isNotNull)
      : Array.from(this.templatesById.values())
    let pairs: { siteId?: string, templateId: string }[] = []
    if (filter.global !== false) pairs.push(...templates.map(t => ({ templateId: t.id })))
    let sitesById: Record<string, Site> = {}
    if (filter.global !== true) {
      let sites: Site[]
      if (filter.siteIds?.length) {
        sites = (await Promise.all(filter.siteIds.map(async id => await siteService.findById(id)))).filter(isNotNull)
      } else {
        this.allSites ??= await this.svc(SiteServiceInternal).find()
        sites = this.allSites
      }
      sitesById = keyby(sites, 'id')
      for (const site of sites) pairs.push(...templates.map(t => ({ siteId: site.id, templateId: t.id })))
    }
    pairs = intersect({ skipEmpty: true }, pairs, idPairs)
    const filledPairs = pairs.map(p => ({ site: sitesById[p.siteId ?? ''], template: this.templatesById!.get(p.templateId) }))
    const dataRoots = filledPairs.filter(p => p.template).map(p => new DataRoot(p.site, p.template!))
    return await this.removeUnauthorized(dataRoots)
  }

  async findBySite (site: Site, filter?: DataRootFilter) {
    return await this.find({ ...filter, siteIds: [site.id], global: false })
  }

  async findByFolder (folder: DataFolder) {
    const dataroots = folder.siteId
      ? await this.find({ global: false, siteIds: [folder.siteId], templateIds: [folder.templateId] })
      : await this.find({ global: true, templateIds: [folder.templateId] })
    return dataroots[0]
  }

  async mayView (obj: DataRoot) {
    return await this.haveDataRootPerm(obj, 'view')
  }

  async mayViewForEdit (obj: DataRoot) {
    return await this.haveDataRootPerm(obj, 'viewForEdit')
  }

  async mayCreate (obj: DataRoot) {
    return await this.haveDataRootPerm(obj, 'create')
  }
}
