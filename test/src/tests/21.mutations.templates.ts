/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createPagetree (name: string, siteId: string, templateKey: string, validateOnly?: boolean) {
  const data = { savedAtVersion: '20220801120000', templateKey, title: 'Test Title' }
  const { createPagetree: { success, messages, pagetree } } = await query(`
    mutation CreatePagetree ($siteId: ID!, $name: String!, $data: JsonData!, $validateOnly: Boolean) {
      createPagetree (siteId: $siteId, name: $name, data: $data, validateOnly: $validateOnly) {
        success
        messages { message }
        pagetree { id name type deleted }
      }
    }`, { siteId, name, data, validateOnly })
  return { success, messages, pagetree }
}

async function createTestSiteAndPagetrees (name: string, templateKey: string) {
  const { createSite: { site } } = await query(`
    mutation CreateSite ($args: CreateSiteInput!) {
      createSite (args: $args) {
        success
        site { id name pagetrees(filter: { types: [PRIMARY] }) { id name } }
      }
    }`, { args: { name, rootPageTemplateKey: templateKey, schemaVersion: DateTime.utc() } })
  const { pagetree: sandbox1 } = await createPagetree('sandbox1', site.id, templateKey)
  const { pagetree: sandbox2 } = await createPagetree('sandbox2', site.id, templateKey)
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
    const { sites } = await query(`{ sites (filter: { ids: [${site.id}]}) { templates { key} pagetrees(filter: { ids: [${sandbox1Id},${sandbox2Id}]}) { id name templates { key} } } }`)
    expect(sites[0].templates.map(t => t.key)).to.include('keyp2')
    for (const pagetree of sites[0].pagetrees) {
      expect(pagetree.templates.map(t => t.key)).to.not.include('keyp2')
    }
  })
  it('should not accept pagetrees from different sites when authorizing a template for multiple pagetrees', async () => {
    const { sandbox1Id, sandbox2Id } = await createTestSiteAndPagetrees('templatetest8', 'keyp1')
    const { success, messages } = await authorizeTemplateForPagetrees('keyp2', [sandbox2Id, sandbox1Id, 1])
    expect(success).to.be.false
    expect(messages.length).to.be.greaterThan(0)
  })
  it('should make a template universal', async () => {
    const { setTemplateUniversal: { success } } = await query(`
      mutation setTemplateUniversal ($templateKey: ID!, $universal: Boolean!) {
        setTemplateUniversal (templateId: $templateKey, universal: $universal) {
          success
        }
      }`, { templateKey: 'keyc3', universal: true })
    expect(success).to.be.true
    const { templates } = await query('{ templates(filter: { keys: ["keyc3"] }) { universal } }')
    expect(templates[0].universal).to.be.true
    // setting it back to false so it doesn't interfere with other tests
    await query(`
      mutation setTemplateUniversal ($templateKey: ID!, $universal: Boolean!) {
        setTemplateUniversal (templateId: $templateKey, universal: $universal) {
          success
        }
      }`, { templateKey: 'keyc3', universal: false })
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
