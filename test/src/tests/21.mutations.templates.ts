/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import db from 'mysql2-async/db'

chai.use(chaiAsPromised)

async function createPagetree (siteId: string, templateKey: string, validateOnly?: boolean) {
  const data = { savedAtVersion: '20220801120000', templateKey, title: 'Test Title' }
  const { createPagetree: { success, messages, pagetree } } = await query(`
    mutation CreatePagetree ($siteId: ID!, $data: JsonData!, $validateOnly: Boolean) {
      createPagetree (siteId: $siteId, data: $data, validateOnly: $validateOnly) {
        success
        messages { message }
        pagetree { id name type deleted }
      }
    }`, { siteId, data, validateOnly })
  return { success, messages, pagetree }
}

async function createTestSiteAndPagetrees (name: string, templateKey: string) {
  const data = { savedAtVersion: '20220901120000', templateKey, title: 'Test title' }
  const { createSite: { site } } = await query(`
    mutation CreateSite ($name: UrlSafeString!, $data: JsonData!) {
      createSite (name: $name, data: $data) {
        success
        site { id name pagetrees(filter: { types: [PRIMARY] }) { id name } }
      }
    }`, { name, data })
  const { pagetree: sandbox1 } = await createPagetree(site.id, templateKey)
  const { pagetree: sandbox2 } = await createPagetree(site.id, templateKey)
  return { site, primaryPagetreeId: site.pagetrees[0].id, sandbox1Id: sandbox1.id, sandbox2Id: sandbox2.id }
}

async function authorizeTemplateForSite (templateKey: string, siteId: string, username?: string) {
  const { authorizeTemplateForSite: { success, messages } } = await queryAs((username ?? 'su01'), `
    mutation AuthorizeTemplateForSite ($templateKey:ID!, $siteId: ID!) {
      authorizeTemplateForSite (templateKey:$templateKey, siteId:$siteId) {
        success
        messages {
          message
          type
          arg
        }
      }
    }
  `, { templateKey, siteId })
  return { success, messages }
}

async function authorizeTemplateForPagetrees (templateKey: string, pagetreeIds: string[], username?: string) {
  const { authorizeTemplateForPagetrees: { success, messages } } = await queryAs((username ?? 'su01'), `
    mutation AuthorizeTemplateForPagetrees ($templateKey:ID!, $pagetreeIds: [ID!]!) {
      authorizeTemplateForPagetrees (templateKey:$templateKey, pagetreeIds:$pagetreeIds) {
        success
        messages {
          message
          type
          arg
        }
      }
    }
  `, { templateKey, pagetreeIds })
  return { success, messages }
}

describe('templates mutations', () => {
  it('should authorize a template for a pagetree', async () => {
    const { site, primaryPagetreeId } = await createTestSiteAndPagetrees('templatetest1', 'keyp1')
    const { success } = await authorizeTemplateForPagetrees('keyp2', [primaryPagetreeId])
    expect(success).to.be.true
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { pagetrees(filter: { ids: [${primaryPagetreeId}]}) { id name templates { key} } } }`)
    expect(sites[0].pagetrees[0].templates.map(t => t.key)).to.include('keyp2')
  })
  it('should authorize a template for multiple pagetrees', async () => {
    const { site, primaryPagetreeId, sandbox1Id } = await createTestSiteAndPagetrees('templatetest2', 'keyp1')
    const { success } = await authorizeTemplateForPagetrees('keyp2', [primaryPagetreeId, sandbox1Id])
    expect(success).to.be.true
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { pagetrees(filter: { ids: [${primaryPagetreeId}]}) { id name templates { key} } } }`)
    for (const pagetree of sites[0].pagetrees) {
      expect(pagetree.templates.map(t => t.key)).to.include('keyp2')
    }
  })
  it('should not allow an unauthorized user to authorize a template for a pagetree', async () => {
    const { primaryPagetreeId } = await createTestSiteAndPagetrees('templatetest3', 'keyp1')
    await expect(authorizeTemplateForPagetrees('keyp2', [primaryPagetreeId], 'ed07')).to.be.rejected
  })
  it('should authorize a template for a site', async () => {
    const { site } = await createTestSiteAndPagetrees('templatetest4', 'keyp1')
    const { success } = await authorizeTemplateForSite('keyp2', site.id)
    expect(success).to.be.true
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key} } }`)
    expect(sites[0].templates.map(t => t.key)).to.include('keyp2')
  })
  it('should not allow an unauthorized user to authorize a template for a site', async () => {
    const { site } = await createTestSiteAndPagetrees('templatetest5', 'keyp1')
    await expect(authorizeTemplateForSite('keyp2', site.id, 'ed07')).to.be.rejected
  })
  it('should remove site-level authorization for a template if that template is authorized for pagetrees within that site', async () => {
    const { site, sandbox1Id, sandbox2Id } = await createTestSiteAndPagetrees('templatetest6', 'keyp1')
    await authorizeTemplateForSite('keyp2', site.id)
    const { success } = await authorizeTemplateForPagetrees('keyp2', [sandbox2Id, sandbox1Id])
    expect(success).to.be.true
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key} pagetrees(filter: { ids: [${sandbox1Id},${sandbox2Id}]}) { id name templates { key} } } }`)
    expect(sites[0].templates.map(t => t.key)).to.not.include('keyp2')
    for (const pagetree of sites[0].pagetrees) {
      expect(pagetree.templates.map(t => t.key)).to.include('keyp2')
    }
  })
  it('should remove all pagetree-level authorizations for a template if that template is authorized for the pagetrees\'s site', async () => {
    const { site, sandbox1Id, sandbox2Id } = await createTestSiteAndPagetrees('templatetest7', 'keyp1')
    await authorizeTemplateForPagetrees('keyp2', [sandbox2Id, sandbox1Id])
    const { success } = await authorizeTemplateForSite('keyp2', site.id)
    expect(success).to.be.true
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key } pagetrees(filter: { ids: [${sandbox1Id},${sandbox2Id}]}) { id name templates { key} } } }`)
    expect(sites[0].templates.map(t => t.key)).to.include('keyp2')
    const pagetreeTemplates = await db.getval<number>(`
      SELECT COUNT(*) FROM pagetrees_templates
      INNER JOIN templates on pagetrees_templates.templateId = templates.id
      WHERE pagetrees_templates.pagetreeId IN (?,?) AND templates.key = ?`, [sandbox2Id, sandbox1Id, 'keyp2'])
    expect(pagetreeTemplates).to.equal(0)
  })
  it('should not accept pagetrees from different sites when authorizing a template for multiple pagetrees', async () => {
    const { sandbox1Id, sandbox2Id } = await createTestSiteAndPagetrees('templatetest8', 'keyp1')
    const { success, messages } = await authorizeTemplateForPagetrees('keyp2', [sandbox2Id, sandbox1Id, 1])
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
  })
  it('should deauthorize a template for a site and its pagetrees', async () => {
    const { site, sandbox1Id, sandbox2Id } = await createTestSiteAndPagetrees('templatetest9', 'keyp1')
    await authorizeTemplateForSite('keyp3', site.id)
    const { deauthorizeTemplate: { success: siteSuccess } } = await query(`
      mutation deauthorizeTemplate($templateKey: ID!, $siteId: ID!) {
        deauthorizeTemplate (templateKey: $templateKey, siteId: $siteId) {
          success
          messages {
            message
          }
        }
      }`, { templateKey: 'keyp3', siteId: site.id })
    expect(siteSuccess).to.be.true
    const { sites: sites1 } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key } } }`)
    expect(sites1[0].templates.map(t => t.key)).to.not.include('keyp3')
    await authorizeTemplateForPagetrees('keyp3', [sandbox1Id, sandbox2Id])
    const { deauthorizeTemplate: { success: pagetreesSuccess } } = await query(`
      mutation deauthorizeTemplate($templateKey: ID!, $siteId: ID!) {
        deauthorizeTemplate (templateKey: $templateKey, siteId: $siteId) {
          success
          messages {
            message
          }
        }
      }`, { templateKey: 'keyp3', siteId: site.id })
    expect(pagetreesSuccess).to.be.true
    const { sites: sites2 } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key } pagetrees(filter: { ids: [${sandbox1Id},${sandbox2Id}]}) { id name templates { key} } } }`)
    for (const p of sites2[0].pagetrees) {
      expect(p.templates.map(t => t.key)).to.not.include('keyp3')
    }
  })
  it('should make a template universal', async () => {
    const { setTemplateUniversal: { success } } = await query(`
      mutation setTemplateUniversal ($templateKey: ID!, $universal: Boolean!) {
        setTemplateUniversal (templateId: $templateKey, universal: $universal) {
          success
        }
      }`, { templateKey: 'keyp4', universal: true })
    expect(success).to.be.true
    const { templates } = await query('{ templates(filter: { keys: ["keyp4"] }) { universal } }')
    expect(templates[0].universal).to.be.true
    // setting it back to false so it doesn't interfere with other tests
    await query(`
      mutation setTemplateUniversal ($templateKey: ID!, $universal: Boolean!) {
        setTemplateUniversal (templateId: $templateKey, universal: $universal) {
          success
        }
      }`, { templateKey: 'keyp4', universal: false })
  })
  it('should not show the non-universal template as usable to an unauthorized user', async () => {
    const { pages } = await queryAs('ed01', `
      { pages (filter: { paths: ["/site3"] }) {
        templates (filter: { types: [PAGE] }) {
          key
        }
      } }
    `)
    expect(pages[0].templates.some(t => t.key === 'keyp4')).to.be.false
  })
  it('should not allow an unauthorized user to make a template universal', async () => {
    await expect(queryAs('ed07', `
      mutation setTemplateUniversal ($templateKey: ID!, $universal: Boolean!) {
        setTemplateUniversal (templateId: $templateKey, universal: $universal) {
          success
        }
      }`, { templateKey: 'keyc2', universal: true })).to.be.rejected
  })
})
