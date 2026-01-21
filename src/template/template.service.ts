import { ManyJoinedLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { BaseService, ValidatedResponse } from '@txstate-mws/graphql-server'
import { Cache, isNotNull, stringify, unique, mapConcurrent, keyby } from 'txstate-utils'
import {
  type Template, type TemplateFilter, getTemplates, getTemplatesByPagetree, getTemplatesBySite,
  DosGatoService, authorizeForPagetrees, authorizeForSite, setUniversal, PagetreeServiceInternal,
  SiteServiceInternal, type Page, collectTemplates, PageServiceInternal,
  deauthorizeTemplate, getTemplatePagetreePairs, templateRegistry, TemplateType
} from '../internal.js'

const templatesByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: string[]) => {
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

async function getAvailableComponents (templateKey: string, svc: TemplateServiceInternal): Promise<string[]> {
  const areas = (await svc.loaders.get(templatesByKeyLoader).load(templateKey))?.areas ?? []
  if (!areas.length) return []
  const directKeys = unique((areas?.map(a => a.availableComponents) ?? []).flat()).filter(k => k !== templateKey)
  const indirectKeys = (await Promise.all(directKeys.map(async (k) => await getAvailableComponents(k, svc)))).flat()
  return unique([...directKeys, ...indirectKeys])
}

async function getAvailableComponentsInTemplate (templateKey: string, svc: TemplateServiceInternal) {
  const keys = await getAvailableComponents(templateKey, svc)
  return await svc.loaders.loadMany(templatesByKeyLoader, keys)
}

const pageTemplateAvailableComponents = new Cache(async (_key: string, svc: TemplateServiceInternal) => {
  const pageTemplateKeys = (await getTemplates({ types: [TemplateType.PAGE] })).filter(t => !t.deleted).map(t => t.key)
  const availableComponentsByPageTemplateKey = await Promise.all(pageTemplateKeys.map(async (key) => {
    return {
      key,
      availableComponents: (await getAvailableComponentsInTemplate(key, svc)).map(t => t.key)
    }
  }))
  return keyby(availableComponentsByPageTemplateKey, 'key')
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

  async findById (id: string) {
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

  async getRootPageTemplates (componentTemplateKey: string) {
    const templatesCache = await pageTemplateAvailableComponents.get('', this)
    const pageTemplatesAllowingComponent = Object.keys(templatesCache).filter(key => templatesCache[key].availableComponents.includes(componentTemplateKey))
    return await this.ctx.loaders.loadMany(templatesByKeyLoader, pageTemplatesAllowingComponent)
  }
}

export class TemplateService extends DosGatoService<Template> {
  raw = this.svc(TemplateServiceInternal)

  async find (filter?: TemplateFilter) {
    return this.removeUnauthorized(await this.raw.find(filter))
  }

  async findById (id: string) {
    return this.removeUnauthorized(await this.raw.findById(id))
  }

  async findByKey (key: string) {
    return this.removeUnauthorized(await this.raw.findByKey(key))
  }

  async findByKeys (keys: string[]) {
    return this.removeUnauthorized(await this.raw.findByKeys(keys))
  }

  async findBySiteId (siteId: string, filter?: TemplateFilter) {
    return this.removeUnauthorized(await this.raw.findBySiteId(siteId, filter))
  }

  async findByPagetreeId (pagetreeId: string, filter?: TemplateFilter) {
    return this.removeUnauthorized(await this.raw.findByPagetreeId(pagetreeId, filter))
  }

  async getRootPageTemplates (templateKey: string) {
    return this.removeUnauthorized(await this.raw.getRootPageTemplates(templateKey))
  }

  async authorizeForPagetrees (templateKey: string, pagetreeIds: string[]) {
    const template = await this.raw.findByKey(templateKey)
    if (!template) throw new Error('Template to be authorized does not exist')
    const pagetrees = (await mapConcurrent(pagetreeIds, async (id) => {
      return await this.svc(PagetreeServiceInternal).findById(id)
    })).filter(isNotNull)
    const response: ValidatedResponse = new ValidatedResponse({ success: true })
    if (!this.mayAssign(template)) throw new Error('Current user is not permitted to authorize this template for this pagetree.')
    if (unique(pagetrees.map(p => p.siteId)).length > 1) {
      response.addMessage('Pagetrees must belong to the same site', 'pagetreeIds')
    }
    if (response.hasErrors()) {
      return response
    }
    await authorizeForPagetrees(template, pagetrees, this.ctx.authInfo.user!.internalId)
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
    if (!this.mayAssign(template)) throw new Error('Current user is not permitted to authorize this template for this site')
    await authorizeForSite(template, site, this.ctx.authInfo.user!.internalId)
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
    if (!this.mayAssign(template)) throw new Error('Current user is not permitted to deauthorize this template for this site')
    await deauthorizeTemplate(template, site, this.ctx.authInfo.user!.internalId)
    this.loaders.clear()
    return new ValidatedResponse({ success: true })
  }

  async setUniversal (templateId: string, universal: boolean) {
    const template = await this.raw.findByKey(templateId)
    if (!template) throw new Error('Template to be modified does not exist')
    if (!this.maySetUniversal(template)) throw new Error('Current user is not permitted to change whether or not this template is universal.')
    try {
      await setUniversal(template.id, universal)
      return new ValidatedResponse({ success: true })
    } catch (err: any) {
      console.error(err)
      throw new Error('An unknown error occurred while setting the universal property for a template')
    }
  }

  mayView (template: Template) {
    return true
  }

  mayAssign (template: Template) {
    return this.haveGlobalPerm('manageTemplates')
  }

  maySetUniversal (template: Template) {
    return this.haveGlobalPerm('manageTemplates')
  }

  mayManage () {
    return this.haveGlobalPerm('manageTemplates')
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
    if (this.haveTemplatePerm(template, 'use')) return true
    return !!(await this.loaders.get(mayUseTemplateInPagetreeLoader).load({ pagetreeId: page.pagetreeId, templateKey: template.key }))
  }

  /**
   * Returns true when the site allows the template or the template is universal. If the user
   * has a role that allows them to use the template, it will not be taken into account.
   */
  async mayUseOnPageWithoutRole (template: Template, page: Page) {
    if (template.type === 'component') {
      const pageTemplate = templateRegistry.getPageTemplate(page.templateKey)
      if (pageTemplate.disallowSet.has(template.key)) return false
    }
    if (template.universal) return true
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
