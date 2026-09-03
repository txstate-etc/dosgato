import { expect } from 'chai'
import { getJson, postMultipart, query, queryAs } from '../common.js'

interface MutationLogRow {
  createdAt: string
  login: string
  mutation: string | null
  query: string
  variables: Record<string, any>
}

async function getMutationLog () {
  return await getJson<MutationLogRow[]>('/mutationlog')
}

/** The API writes the log from its `after` hook without awaiting it before responding, so give it a moment to land. */
async function waitForLogRows (predicate: (row: MutationLogRow) => boolean, expectedCount: number) {
  let rows: MutationLogRow[] = []
  for (let i = 0; i < 20; i++) {
    rows = (await getMutationLog()).filter(predicate)
    if (rows.length >= expectedCount) break
    await new Promise<void>(resolve => { setTimeout(resolve, 100) })
  }
  return rows
}

async function getSiteRoots (name: string) {
  const { sites } = await query('{ sites { name rootPage { id } rootAssetFolder { id } } }')
  const site = sites.find((s: any) => s.name === name)
  return { rootPageId: site.rootPage.id as string, rootAssetFolderId: site.rootAssetFolder.id as string }
}

describe('mutation log', function () {
  this.timeout(10000)
  it('should log a successful graphql mutation with the acting user, operation name, query, and variables', async () => {
    const { createGroup: { success } } = await queryAs('su02', 'mutation CreateGroup ($name: String!) { createGroup (name: $name) { success } }', { name: 'mutationLogGroup' })
    expect(success).to.be.true
    const rows = await waitForLogRows(r => r.variables.name === 'mutationLogGroup', 1)
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].login).to.equal('su02')
    expect(rows[0].mutation).to.equal('CreateGroup')
    expect(rows[0].query).to.include('createGroup')
    expect(rows[0].createdAt).to.be.a('string')
  })
  it('should not log a mutation that failed validation', async () => {
    const { createGroup: { success } } = await query('mutation CreateGroup ($name: String!) { createGroup (name: $name) { success } }', { name: 'mutationLogGroup' })
    expect(success).to.be.false
    const rows = (await getMutationLog()).filter(r => r.variables.name === 'mutationLogGroup')
    expect(rows).to.have.lengthOf(1)
  })
  it('should not log a validateOnly mutation', async () => {
    const { createGroup: { success } } = await query('mutation CreateGroup ($name: String!, $validateOnly: Boolean) { createGroup (name: $name, validateOnly: $validateOnly) { success } }', { name: 'mutationLogValidateOnly', validateOnly: true })
    expect(success).to.be.true
    const rows = (await getMutationLog()).filter(r => r.variables.name === 'mutationLogValidateOnly')
    expect(rows).to.have.lengthOf(0)
  })
  it('should not log queries', async () => {
    await query('query MutationLogQueryCheck { groups { id } }')
    const rows = (await getMutationLog()).filter(r => r.mutation === 'MutationLogQueryCheck')
    expect(rows).to.have.lengthOf(0)
  })
  it('should redact component data but preserve the templateKey', async () => {
    const { rootPageId } = await getSiteRoots('site1')
    const { createPage: { success, page } } = await query(`
      mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) {
        createPage (name: $name, data: $data, targetId: $targetId) { success page { id } }
      }`, { name: 'mutationlogpage', data: { templateKey: 'keyp1', savedAtVersion: '20220710120000', title: 'Mutation Log Page' }, targetId: rootPageId })
    expect(success).to.be.true
    const rows = await waitForLogRows(r => r.mutation === 'CreatePage' && r.variables.name === 'mutationlogpage', 1)
    expect(rows).to.have.lengthOf(1)
    expect(rows[0].variables.data).to.deep.equal({ redacted: true, templateKey: 'keyp1' })
    expect(rows[0].variables.targetId).to.equal(rootPageId)
    await query('mutation DeletePages ($pageIds: [ID!]!) { deletePages (pageIds: $pageIds) { success } }', { pageIds: [page.id] })
  })
  it('should log RESTful asset uploads', async () => {
    const { rootAssetFolderId } = await getSiteRoots('site1')
    const isUploadToRoot = (r: MutationLogRow) => r.mutation === 'createAsset' && r.variables.folderId === rootAssetFolderId
    const before = (await getMutationLog()).filter(isUploadToRoot).length
    const { success, ids } = await postMultipart(`/assets/${rootAssetFolderId}`, {}, '/usr/app/files/blank.jpg', 'su01')
    expect(success).to.be.true
    const rows = await waitForLogRows(isUploadToRoot, before + 1)
    expect(rows).to.have.lengthOf(before + 1)
    expect(rows[0].login).to.equal('su01')
    expect(rows[0].query).to.include('uploadCreateAsset')
    await query('mutation DeleteAssets ($assetIds: [ID!]!) { deleteAssets (assetIds: $assetIds) { success } }', { assetIds: ids })
  })
})
