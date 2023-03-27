import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { isNotNull, isNull, stringify, unique, mapConcurrent } from 'txstate-utils'
import {
  type Template, type TemplateFilter, getTemplates, getTemplatesByPagetree, getTemplatesBySite,
  DosGatoService, authorizeForPagetrees, authorizeForSite, setUniversal, PagetreeServiceInternal,
  SiteServiceInternal, type Page, collectTemplates, PageServiceInternal, universalTemplateCache,
  deauthorizeTemplate, getTemplatePagetreePairs, templateRegistry
} from '../internal.js'

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

const mayUseTemplateInPagetreeLoader = new PrimaryKeyLoader({
  fetch: async (pairs: { pagetreeId: string, templateKey: string }[]) => {
    return await getTemplatePagetreePairs(pairs)
  },
  extractId: row => ({ pagetreeId: String(row.pagetreeId), templateKey: row.templateKey })
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

  async authorizeForPagetrees (templateKey: string, pagetreeIds: string[]) {
    const template = await this.raw.findByKey(templateKey)
    if (!template) throw new Error('Template to be authorized does not exist')
    const pagetrees = (await mapConcurrent(pagetreeIds, async (id) => {
      return await this.svc(PagetreeServiceInternal).findById(id)
    })).filter(isNotNull)
    const response: ValidatedResponse = new ValidatedResponse({ success: true })
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to authorize this template for this pagetree.')
    if (unique(pagetrees.map(p => p.siteId)).length > 1) {
      response.addMessage('Pagetrees must belong to the same site', 'pagetreeIds')
    }
    if (response.hasErrors()) {
      return response
    }
    const currentUser = await this.currentUser()
    await authorizeForPagetrees(template, pagetrees, currentUser!.internalId)
    this.loaders.clear()
    return response
  }

  async authorizeForSite (templateKey: string, siteId: string) {
    const [template, site] = await Promise.all([
      this.raw.findByKey(templateKey),
      this.svc(SiteServiceInternal).findById(siteId)
    ])
    if (!template) throw new Error('Template to be authorized does not exist')
    if (!site) throw new Error('Cannot authorize template for a site that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to authorize this template for this site')
    const currentUser = await this.currentUser()
    await authorizeForSite(template, site, currentUser!.internalId)
    this.loaders.clear()
    return new ValidatedResponse({ success: true })
  }

  async deauthorizeTemplate (templateKey: string, siteId: string) {
    const [template, site] = await Promise.all([
      this.raw.findByKey(templateKey),
      this.svc(SiteServiceInternal).findById(siteId)
    ])
    if (!template) throw new Error('Template to be authorized does not exist')
    if (!site) throw new Error('Cannot authorize template for a site that does not exist')
    if (!(await this.mayAssign(template))) throw new Error('Current user is not permitted to deauthorize this template for this site')
    const currentUser = await this.currentUser()
    await deauthorizeTemplate(template, site, currentUser!.internalId)
    this.loaders.clear()
    return new ValidatedResponse({ success: true })
  }

  async setUniversal (templateId: string, universal: boolean) {
    const template = await this.raw.findByKey(templateId)
    if (!template) throw new Error('Template to be modified does not exist')
    if (!(await this.maySetUniversal(template))) throw new Error('Current user is not permitted to change whether or not this template is universal.')
    try {
      await setUniversal(template.id, universal)
      await universalTemplateCache.refresh()
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while setting the universal property for a template')
    }
  }

  async mayView (template: Template) {
    return true
  }

  // TODO: Can we remove these two methods?

  async mayAssign (template: Template) {
    return await this.haveGlobalPerm('manageTemplates')
  }

  async maySetUniversal (template: Template) {
    return await this.haveGlobalPerm('manageTemplates')
  }

  async mayManage () {
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
  async mayUseOnPage (template: Template, page: Page, pageTemplateKey?: string) {
    if (template.type === 'component') {
      const pageTemplate = templateRegistry.getPageTemplate(pageTemplateKey ?? page.templateKey)
      if (pageTemplate.disallowSet.has(template.key)) return false
    }
    if (template.universal) return true
    if (await this.haveTemplatePerm(template, 'use')) return true
    return !!(await this.loaders.get(mayUseTemplateInPagetreeLoader).load({ pagetreeId: page.pagetreeId, templateKey: template.key }))
  }

  /**
   * This should be used on page updates to validate whether a template is valid for a
   * page. It may say 'yes' on templates that would otherwise not be valid because they
   * are already on the page. This allows people with extra authority to add certain
   * template types to a page without preventing later updates by less privileged users.
   */
  async mayKeepOnPage (templateKey: string, page: Page, template: Template | undefined) {
    page.existingTemplateKeys ??= collectTemplates(await this.svc(PageServiceInternal).getData(page))
    // It's important to check for pre-existence before checking whether the template is
    // defined. We don't want pages getting stuck in non-editable state when they have an old
    // templateKey in them.
    if (page.existingTemplateKeys.has(templateKey)) return true
    if (!template) return false
    return await this.svc(TemplateService).mayUseOnPage(template, page)
  }
}
