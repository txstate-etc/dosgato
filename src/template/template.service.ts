import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  Template, TemplateFilter, getTemplates, getTemplatesByPagetree, getTemplatesBySite,
  DosGatoService, PagetreeService, authorizeForPagetree, deauthorizeForPagetree,
  authorizeForSite, deauthorizeForSite, setUniversal, SiteService, PagetreeServiceInternal, SiteServiceInternal
} from 'internal'

const templatesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getTemplates({ ids })
  }
})
const templatesByKeyLoader = new PrimaryKeyLoader({
  fetch: async (keys: string[]) => {
    return await getTemplates({ keys })
  },
  extractId: tmpl => tmpl.key,
  idLoader: templatesByIdLoader
})
templatesByIdLoader.addIdLoader(templatesByKeyLoader)

const templatesBySiteIdLoader = new ManyJoinedLoader({
  fetch: async (siteIds: string[], filter?: TemplateFilter) => {
    return await getTemplatesBySite(siteIds, filter)
  },
  idLoader: [templatesByIdLoader, templatesByKeyLoader]
})

const templatesByPagetreeIdLoader = new ManyJoinedLoader({
  fetch: async (pagetreeIds: string[], filter?: TemplateFilter) => {
    return await getTemplatesByPagetree(pagetreeIds, filter)
  },
  idLoader: [templatesByIdLoader, templatesByKeyLoader]
})

export class TemplateServiceInternal extends BaseService {
  async find (filter?: TemplateFilter) {
    const templates = await getTemplates(filter)
    for (const t of templates) {
      this.loaders.get(templatesByIdLoader).prime(t.id, t)
      this.loaders.get(templatesByKeyLoader).prime(t.key, t)
    }
    return templates
  }

  async findById (id: number) {
    return await this.loaders.get(templatesByIdLoader).load(id)
  }

  async findByKey (key: string) {
    return await this.loaders.get(templatesByKeyLoader).load(key)
  }

  async findByKeys (keys: string[]) {
    return await this.loaders.loadMany(templatesByKeyLoader, keys)
  }

  async findBySiteId (siteId: string, filter?: TemplateFilter) {
    return await this.loaders.get(templatesBySiteIdLoader, filter).load(siteId)
  }

  async findByPagetreeId (pagetreeId: string, filter?: TemplateFilter) {
    return await this.loaders.get(templatesByPagetreeIdLoader, filter).load(pagetreeId)
  }
}

export class TemplateService extends DosGatoService<Template> {
  raw = this.svc(TemplateServiceInternal)

  async find (filter?: TemplateFilter) {
    return await this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: number) {
    return await this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByKey (key: string) {
    return await this.removeUnauthorized(await this.raw.findByKey(key))
  }

  async findByKeys (keys: string[]) {
    return await this.removeUnauthorized(await this.raw.findByKeys(keys))
  }

  async findBySiteId (siteId: string, filter?: TemplateFilter) {
    return await this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByPagetreeId (pagetreeId: string, filter?: TemplateFilter) {
    return await this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId, filter))
  }

  async authorizeForPagetree (templateId: string, pagetreeId: string) {
    const [template, pagetree] = await Promise.all([
      this.raw.findById(Number(templateId)),
      this.svc(PagetreeServiceInternal).findById(pagetreeId)
    ])
    if (!template) throw new Error('Template to be authorized does not exist')
    if (!pagetree) throw new Error('Cannot authorize template for a pagetree that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to authorize this template for this pagetree.')
    try {
      await authorizeForPagetree(templateId, pagetreeId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while authorizing a template for a pagetree')
    }
  }

  async deauthorizeForPagetree (templateId: string, pagetreeId: string) {
    const [template, pagetree] = await Promise.all([
      this.raw.findById(Number(templateId)),
      this.svc(PagetreeServiceInternal).findById(pagetreeId)
    ])
    if (!template) throw new Error('Template to be deauthorized does not exist')
    if (!pagetree) throw new Error('Cannot deauthorize template for a pagetree that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to deauthorize this template for this pagetree')
    try {
      const removed = await deauthorizeForPagetree(templateId, pagetreeId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        return ValidatedResponse.error('Template was not authorized for pagetree.')
      }
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while deauthorizing a template for a pagetree')
    }
  }

  async authorizeForSite (templateId: string, siteId: string) {
    const [template, site] = await Promise.all([
      this.raw.findById(Number(templateId)),
      this.svc(SiteServiceInternal).findById(siteId)
    ])
    if (!template) throw new Error('Template to be authorized does not exist')
    if (!site) throw new Error('Cannot authorize template for a site that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to authorize this template for this site')
    try {
      await authorizeForSite(templateId, siteId)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while authorizing a template for a site.')
    }
  }

  async deauthorizeForSite (templateId: string, siteId: string) {
    const [template, site] = await Promise.all([
      this.raw.findById(Number(templateId)),
      this.svc(SiteServiceInternal).findById(siteId)
    ])
    if (!template) throw new Error('Template to be authorized does not exist')
    if (!site) throw new Error('Cannot authorize template for a site that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to deauthorize this template for this site')
    try {
      const removed = await deauthorizeForSite(templateId, siteId)
      if (removed) {
        return new ValidatedResponse({ success: true })
      } else {
        return ValidatedResponse.error('Template was not authorized for site.')
      }
    } catch (err: any) {
      console.log(err)
      throw new Error('An unknown error occurred while deauthorizing a template for a site')
    }
  }

  async setUniversal (templateId: string, universal: boolean) {
    const template = await this.raw.findById(Number(templateId))
    if (!template) throw new Error('Template to be modified does not exist')
    if (!(await this.maySetUniversal(template))) throw new Error('Current user is not permitted to change whether or not this template is universal.')
    try {
      await setUniversal(templateId, universal)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while setting the universal property for a template')
    }
  }

  async mayView (template: Template) {
    return true
  }

  async mayAssign (template: Template) {
    return await this.haveGlobalPerm('manageUsers')
  }

  async maySetUniversal (template: Template) {
    return await this.haveGlobalPerm('manageUsers')
  }
}
