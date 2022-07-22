import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import {
  Template, TemplateFilter, getTemplates, getTemplatesByPagetree, getTemplatesBySite,
  DosGatoService, authorizeForPagetree, deauthorizeForPagetree,
  authorizeForSite, deauthorizeForSite, setUniversal, PagetreeServiceInternal,
  SiteServiceInternal, getTemplatePagePairs, Page, collectTemplates, PageServiceInternal
} from '../internal.js'
import { stringify } from 'txstate-utils'

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

const mayUseTemplateOnPageLoader = new PrimaryKeyLoader({
  fetch: async (pairs: { pageId: string, templateKey: string }[]) => {
    return await getTemplatePagePairs(pairs)
  },
  extractId: row => ({ pageId: row.pageId, templateKey: row.templateKey })
})

export class TemplateServiceInternal extends BaseService {
  #findCache = new Map<string, Template[]>()
  async find (filter?: TemplateFilter) {
    const filterKey = stringify(filter)
    if (!this.#findCache.has(filterKey)) {
      const templates = await getTemplates(filter)
      for (const t of templates) {
        this.loaders.get(templatesByIdLoader).prime(t.id, t)
        this.loaders.get(templatesByKeyLoader).prime(t.key, t)
      }
      this.#findCache.set(filterKey, templates)
    }
    return this.#findCache.get(filterKey)!
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
      console.error(err)
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
    return await this.haveGlobalPerm('manageTemplates')
  }

  async maySetUniversal (template: Template) {
    return await this.haveGlobalPerm('manageTemplates')
  }

  /**
   * Returns true when the site allows the template or the current user
   * is allowed to use the template in question.
   *
   * We also allow templates that are already in use on the page, but this function
   * does NOT reflect that, because it would result in showing that template in the
   * new component or change page template selection process.
   *
   * To take previously used templates into account, use mayKeepOnPage.
   */
  async mayUseOnPage (template: Template, pageId: string) {
    if (await this.haveTemplatePerm(template, 'use')) return true
    return !!(await this.loaders.get(mayUseTemplateOnPageLoader).load({ pageId, templateKey: template.key }))
  }

  /**
   * This should be used on page updates to validate whether a template is valid for a
   * page. It may say 'yes' on templates that would otherwise not be valid because they
   * are already on the page. This allows people with extra authority to add certain
   * template types to a page without preventing later updates by less privileged users.
   */
  async mayKeepOnPage (templateKey: string, page: Page, template: Template|undefined) {
    page.existingTemplateKeys ??= collectTemplates(await this.svc(PageServiceInternal).getData(page))
    // It's important to check for pre-existence before checking whether the template is
    // defined. We don't want pages getting stuck in non-editable state when they have an old
    // templateKey in them.
    if (page.existingTemplateKeys.has(templateKey)) return true
    if (!template) return false
    return await this.svc(TemplateService).mayUseOnPage(template, page.id)
  }
}
