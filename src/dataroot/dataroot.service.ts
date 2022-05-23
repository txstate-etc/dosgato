import { DataFolder, DataRoot, DosGatoService, Site, SiteService, SiteServiceInternal, Template, TemplateService, TemplateType } from 'internal'
import { intersect, isNotNull } from 'txstate-utils'
import { DataRootFilter } from './dataroot.model'

export class DataRootService extends DosGatoService<DataRoot> {
  templatesById?: Map<number, Template>
  templatesByKey?: Map<string, Template>
  allSites?: Site[]

  async find (filter?: DataRootFilter) {
    this.templatesById ??= (await this.svc(TemplateService).find({ types: [TemplateType.DATA] })).reduce((map, template) => map.set(template.id, template), new Map())
    this.templatesByKey ??= Array.from(this.templatesById.values()).reduce((map, template) => map.set(template.key, template), new Map())
    filter ??= {}
    filter.templateKeys = intersect({ skipEmpty: true }, filter.templateKeys, filter.templateIds?.map(tid => this.templatesById!.get(tid)?.key).filter(isNotNull))
    const templates = filter.templateKeys.length
      ? filter.templateKeys.map(k => this.templatesByKey!.get(k)).filter(isNotNull)
      : Array.from(this.templatesById.values())
    let dataRoots: DataRoot[]
    if (filter.global) dataRoots = templates.map(t => new DataRoot(undefined, t))
    else {
      const siteService = this.svc(SiteServiceInternal)
      dataRoots = []
      let sites: Site[]
      if (filter.siteIds?.length) {
        sites = (await Promise.all(filter.siteIds.map(async id => await siteService.findById(id)))).filter(isNotNull)
      } else {
        this.allSites ??= await this.svc(SiteServiceInternal).find()
        sites = this.allSites
      }
      for (const site of sites) dataRoots.push(...templates.map(t => new DataRoot(site, t)))
    }
    return await this.removeUnauthorized(dataRoots)
  }

  async findBySite (site: Site, filter?: DataRootFilter) {
    return await this.find({ ...filter, siteIds: [site.id] })
  }

  async findByFolder (folder: DataFolder) {
    const dataroots = folder.siteId
      ? await this.find({ siteIds: [folder.siteId], templateIds: [folder.templateId] })
      : await this.find({ global: true, templateIds: [folder.templateId] })
    return dataroots[0]
  }

  async mayView (obj: DataRoot) {
    if (obj.site) return await this.svc(SiteService).mayView(obj.site)
    return await this.haveDataRootPerm(obj, 'view')
  }

  async mayViewForEdit (obj: DataRoot) {
    return await this.haveDataRootPerm(obj, 'viewForEdit')
  }

  async mayCreate (obj: DataRoot) {
    return await this.haveDataRootPerm(obj, 'create')
  }
}
