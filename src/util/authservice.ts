import { AuthError, AuthorizedServiceSync } from '@txstate-mws/graphql-server'
import {
  type Asset, type AssetFolder, type Data, type DataFolder, type Page, type Template,
  AssetRuleService, type AssetRuleGrants, DataRuleService, type DataRuleGrants, type GlobalRuleGrants,
  PageRuleService, type PageRuleGrants, type SiteRuleGrants, SiteRuleService, TemplateRuleService,
  type TemplateRuleGrants, type DataRoot, type DGContext, DGMockContext
} from '../internal.js'

export abstract class DosGatoService<ObjType, RedactedType = ObjType> extends AuthorizedServiceSync<{ sub?: string, client_id?: string }, ObjType, RedactedType> {
  ctx!: DGContext

  get login () {
    return this.ctx.login
  }

  protected haveGlobalPerm (grant: keyof GlobalRuleGrants) {
    return this.ctx.authInfo.globalGrants[grant]
  }

  protected haveSitePerm (site: { id: string }, grant: keyof SiteRuleGrants) {
    for (const r of this.ctx.authInfo.siteRules) {
      if (r.grants[grant] && SiteRuleService.applies(r, site.id)) return true
    }
    return false
  }

  protected havePagePerm (page: Page, grant: keyof PageRuleGrants) {
    for (const r of this.ctx.authInfo.pageRules) {
      if (r.grants[grant] && PageRuleService.applies(r, page, page.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  protected haveAssetPerm (asset: Asset, grant: keyof AssetRuleGrants) {
    for (const r of this.ctx.authInfo.assetRules) {
      if (r.grants[grant] && AssetRuleService.applies(r, asset, asset.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  protected haveAssetFolderPerm (folder: AssetFolder, grant: keyof AssetRuleGrants) {
    for (const r of this.ctx.authInfo.assetRules) {
      if (r.grants[grant] && AssetRuleService.applies(r, folder, folder.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  protected haveDataPerm (item: Data, grant: keyof DataRuleGrants) {
    for (const r of this.ctx.authInfo.dataRules) {
      if (r.grants[grant] && DataRuleService.applies(r, item, item.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  protected haveDataFolderPerm (folder: DataFolder, grant: keyof DataRuleGrants) {
    for (const r of this.ctx.authInfo.dataRules) {
      if (r.grants[grant] && DataRuleService.applies(r, folder, folder.resolvedPathWithoutSitename)) return true
    }
    return false
  }

  protected haveDataRootPerm (dataroot: DataRoot, grant: keyof DataRuleGrants) {
    return this.ctx.authInfo.dataRules.some(r => {
      if (r.path !== '/') return false
      if (!r.grants[grant]) return false
      if (r.global && dataroot.site) return false
      if (r.siteId && (r.siteId !== dataroot.site?.id)) return false
      if (r.templateId && (r.templateId !== dataroot.template.id)) return false
      return true
    })
  }

  protected haveTemplatePerm (template: Template, grant: keyof TemplateRuleGrants) {
    return this.ctx.authInfo.templateRules.filter(r => r.grants[grant] && TemplateRuleService.applies(r, template))
  }
}

export async function getEnabledUser (ctx: DGContext) {
  await ctx.waitForAuth()
  const user = ctx.authInfo.user
  if (!user || user.disabled) throw new AuthError()
  return user
}

export function systemContext () {
  return new DGMockContext({ sub: 'system' }) as DGContext
}
