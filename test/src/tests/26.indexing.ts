/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai'
import { query } from '../common.js'
import db from 'mysql2-async/db'

async function createPage (name: string, parentId: string, templateKey: string, extra?: any) {
  const data = { savedAtVersion: '20220710120000', templateKey, title: 'Test Title', ...extra }
  const { createPage: { success, page } } = await query<{ createPage: { success: boolean, page: { id: string, name: string, data: any, version: { version: number } } } }>(
    'mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) { createPage (name: $name, data: $data, targetId: $targetId) { success page { id name data version { version } } } }',
    { name, targetId: parentId, data }
  )
  return { success, page }
}

async function updatePage (pageId: string, dataVersion: number, data: any) {
  const { updatePage: { success, page } } = await query<{ updatePage: { success: boolean, page: { id: string, data: any, version: { version: number } } } }>(`
    mutation updatePage ($pageId: ID!, $data: JsonData!, $dataVersion: Int!) {
      updatePage (pageId: $pageId, data: $data, dataVersion: $dataVersion) {
        success
        page { id data version { version } }
      }
    }
  `, { pageId, dataVersion, data })
  return { success, page }
}

async function publishPages (pageIds: string[]) {
  const { publishPages: { success } } = await query(
    'mutation PublishPages ($pageIds: [ID!]!) { publishPages (pageIds: $pageIds) { success } }',
    { pageIds }
  )
  return success
}

async function getIndexVersions (dataId: string) {
  return await db.getvals<number>('SELECT DISTINCT version FROM indexes WHERE id=? ORDER BY version', [dataId])
}

async function getIndexValues (dataId: string, version: number, indexName: string) {
  return await db.getvals<string>(
    'SELECT iv.value FROM indexes i INNER JOIN indexnames n ON i.name_id=n.id INNER JOIN indexvalues iv ON iv.id=i.value_id WHERE i.id=? AND i.version=? AND n.name=? ORDER BY iv.value',
    [dataId, version, indexName]
  )
}

describe('indexing', () => {
  let rootPageId: string

  before(async () => {
    const { sites } = await query('{ sites { id name rootPage { id } } }')
    const site6 = sites.find((s: any) => s.name === 'site6')
    rootPageId = site6.rootPage.id
  })

  describe('index cleanup on publish', () => {
    it('should remove old version indexes when publishing', async () => {
      // create a page (version 1)
      const { page } = await createPage('idx-pub-test1', rootPageId, 'keyp3', { title: 'Publish Cleanup Test' })
      const dataId = page.id

      // update it twice to create versions 2 and 3
      const { page: v2 } = await updatePage(dataId, page.version.version, { ...page.data, title: 'Publish Cleanup V2' })
      const { page: v3 } = await updatePage(dataId, v2.version.version, { ...v2.data, title: 'Publish Cleanup V3' })

      // before publishing, we should only have indexes for latest (v3) and nothing else
      // because updatePage already cleans intermediate indexes, keeping only published + latest
      // since this page was never published, only latest should remain
      const versionsBeforePublish = await getIndexVersions(dataId)
      expect(versionsBeforePublish).to.deep.equal([v3.version.version])

      // publish
      await publishPages([dataId])

      // after publishing, only the published version (which is latest) should have indexes
      const versionsAfterPublish = await getIndexVersions(dataId)
      expect(versionsAfterPublish).to.deep.equal([v3.version.version])
    })

    it('should remove pre-publish indexes when publishing after edits', async () => {
      // create and publish a page
      const { page } = await createPage('idx-pub-test2', rootPageId, 'keyp3', { title: 'Pre-publish Test' })
      const dataId = page.id
      await publishPages([dataId])

      // create a new draft version
      const { page: v2 } = await updatePage(dataId, page.version.version, { ...page.data, title: 'Pre-publish Draft' })

      // should have 2 indexed versions: published (v1) and latest (v2)
      const versionsBefore = await getIndexVersions(dataId)
      expect(versionsBefore).to.have.lengthOf(2)
      expect(versionsBefore).to.include(page.version.version)
      expect(versionsBefore).to.include(v2.version.version)

      // publish the new version
      await publishPages([dataId])

      // now only v2 should remain (published = latest = v2)
      const versionsAfter = await getIndexVersions(dataId)
      expect(versionsAfter).to.deep.equal([v2.version.version])
    })

    it('should still be findable via phraseSearch after publish cleans old indexes', async () => {
      const { page } = await createPage('idx-pub-search', rootPageId, 'keyp3', { title: 'Zymography Techniques' })
      const dataId = page.id

      // update a few times
      const { page: v2 } = await updatePage(dataId, page.version.version, { ...page.data, title: 'Zymography Methods' })
      await updatePage(dataId, v2.version.version, { ...v2.data, title: 'Zymography Results' })

      // publish — this cleans old version indexes
      await publishPages([dataId])

      // phraseSearch should still find the page by its current title
      const { pages } = await query('{ pages(filter: { phraseSearch: [{ query: "Zymography" }] }) { id title } }')
      expect(pages.map((p: any) => p.id)).to.include(dataId)
      expect(pages.find((p: any) => p.id === dataId).title).to.equal('Zymography Results')
    })
  })

  describe('index cleanup on update', () => {
    it('should keep only published and latest version indexes after update', async () => {
      // create and publish
      const { page } = await createPage('idx-upd-test1', rootPageId, 'keyp3', { title: 'Update Cleanup Test' })
      const dataId = page.id
      await publishPages([dataId])
      const publishedVersion = page.version.version

      // update twice
      const { page: v2 } = await updatePage(dataId, publishedVersion, { ...page.data, title: 'Update Cleanup V2' })
      const { page: v3 } = await updatePage(dataId, v2.version.version, { ...v2.data, title: 'Update Cleanup V3' })

      // should have only published (v1) and latest (v3), NOT v2
      const versions = await getIndexVersions(dataId)
      expect(versions).to.have.lengthOf(2)
      expect(versions).to.include(publishedVersion)
      expect(versions).to.include(v3.version.version)
      expect(versions).to.not.include(v2.version.version)
    })

    it('should only keep latest when page has never been published', async () => {
      const { page } = await createPage('idx-upd-test2', rootPageId, 'keyp3', { title: 'Never Published' })
      const dataId = page.id

      const { page: v2 } = await updatePage(dataId, page.version.version, { ...page.data, title: 'Never Published V2' })

      const versions = await getIndexVersions(dataId)
      expect(versions).to.deep.equal([v2.version.version])
    })
  })

  describe('index cleanup on restore', () => {
    it('should recompute indexes from restored data rather than copying old indexes', async () => {
      // create and publish
      const { page } = await createPage('idx-restore-test', rootPageId, 'keyp3', { title: 'Restore Original' })
      const dataId = page.id
      await publishPages([dataId])

      // update to create version 2
      const { page: v2 } = await updatePage(dataId, page.version.version, { ...page.data, title: 'Restore Changed' })

      // publish v2 so v1 indexes get cleaned up
      await publishPages([dataId])
      const versionsAfterPublish = await getIndexVersions(dataId)
      expect(versionsAfterPublish).to.deep.equal([v2.version.version])

      // restore to version 1 - this should recompute indexes from the restored data
      const { restorePage: { success, page: restored } } = await query<{ restorePage: { success: boolean, page: { id: string, version: { version: number } } } }>(`
        mutation RestorePage ($pageId: ID!, $restoreVersion: Int!) {
          restorePage (pageId: $pageId, restoreVersion: $restoreVersion) {
            success
            page { id version { version } }
          }
        }
      `, { pageId: dataId, restoreVersion: page.version.version })
      expect(success).to.be.true

      // restored version should have indexes even though v1's indexes were deleted
      const versionsAfterRestore = await getIndexVersions(dataId)
      expect(versionsAfterRestore).to.include(restored.version.version)

      // the fulltext index should match the original title, not the changed one
      const fulltextValues = await getIndexValues(dataId, restored.version.version, 'fulltext')
      // "restore" -> 7 chars -> 5-grams: "resto", "estor", "store"
      expect(fulltextValues).to.include('resto')
      expect(fulltextValues).to.include('estor')
      expect(fulltextValues).to.include('store')
      // "original" -> 8 chars -> 5-grams: "origi", "rigin", "igina", "ginal"
      expect(fulltextValues).to.include('origi')
    })
  })

  describe('fulltext indexing', () => {
    it('should store short words (3-4 chars) whole in the fulltext index', async () => {
      const { page } = await createPage('idx-ft-short', rootPageId, 'keyp3', { title: 'The Cats Dogs' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "cats" is 4 chars -> stored whole
      expect(values).to.include('cats')
      // "dogs" is 4 chars -> stored whole
      expect(values).to.include('dogs')
      // "the" is a stopword -> excluded
      expect(values).to.not.include('the')
    })

    it('should create 5-grams for words longer than 4 characters', async () => {
      const { page } = await createPage('idx-ft-fivegram', rootPageId, 'keyp3', { title: 'Undergraduate' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "undergraduate" -> 13 chars, lowercased -> "undergraduate"
      // 5-grams: under, nderg, derga, ergra, rgrad, gradu, radua, aduat, duate
      expect(values).to.include('under')
      expect(values).to.include('nderg')
      expect(values).to.include('gradu')
      expect(values).to.include('duate')
      // should NOT contain the full word
      expect(values).to.not.include('undergraduate')
    })

    it('should be case-insensitive', async () => {
      const { page } = await createPage('idx-ft-case', rootPageId, 'keyp3', { title: 'HELLO World' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "hello" -> 5 chars -> one 5-gram: "hello"
      expect(values).to.include('hello')
      // "world" -> 5 chars -> one 5-gram: "world"
      expect(values).to.include('world')
      expect(values).to.not.include('HELLO')
      expect(values).to.not.include('World')
    })

    it('should remove diacritics', async () => {
      const { page } = await createPage('idx-ft-diacritics', rootPageId, 'keyp3', { title: 'Café Résumé' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "café" -> normalized to "cafe" (4 chars) -> stored whole
      expect(values).to.include('cafe')
      // "résumé" -> normalized to "resume" (6 chars) -> 5-grams: "resum", "esume"
      expect(values).to.include('resum')
      expect(values).to.include('esume')
    })

    it('should exclude stopwords', async () => {
      const { page } = await createPage('idx-ft-stopwords', rootPageId, 'keyp3', { title: 'About The Programs' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "about" and "the" are stopwords -> excluded
      expect(values).to.not.include('about')
      expect(values).to.not.include('the')
      // "programs" is 8 chars -> 5-grams
      expect(values).to.include('progr')
      expect(values).to.include('rogra')
      expect(values).to.include('ogram')
      expect(values).to.include('grams')
    })

    it('should exclude words with 2 or fewer characters', async () => {
      const { page } = await createPage('idx-ft-short-exclude', rootPageId, 'keyp3', { title: 'Go To It Quick' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      expect(values).to.not.include('go')
      expect(values).to.not.include('to')
      expect(values).to.not.include('it')
      // "quick" is 5 chars -> one 5-gram
      expect(values).to.include('quick')
    })

    it('should handle hyphenated words by splitting and keeping whole', async () => {
      const { page } = await createPage('idx-ft-hyphen', rootPageId, 'keyp3', { title: 'Self-Driving Cars' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "self-driving" -> ["self", "driving", "self-driving"]
      // "self" is 4 chars -> stored whole
      expect(values).to.include('self')
      // "driving" is 7 chars -> 5-grams: "drivi", "rivin", "iving"
      expect(values).to.include('drivi')
      expect(values).to.include('rivin')
      expect(values).to.include('iving')
      // "self-driving" with hyphen removed is 11 chars -> 5-grams: "selfd", "elfdr", "lfdri", "fdriv", "drivi", "rivin", "iving"
      expect(values).to.include('selfd')
      expect(values).to.include('elfdr')
      expect(values).to.include('lfdri')
      expect(values).to.include('fdriv')
      // "cars" is 4 chars -> stored whole
      expect(values).to.include('cars')
    })

    it('should index fulltext from components in areas', async () => {
      // keyp1 has area "main" that accepts "keyc3" (Quote component with getFulltext returning [quote, author])
      const { page } = await createPage('idx-ft-component', rootPageId, 'keyp1', {
        title: 'Component Fulltext Test',
        areas: {
          main: [
            { templateKey: 'keyc3', quote: 'Knowledge is power', author: 'Francis Bacon' }
          ]
        }
      })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      // "knowledge" -> 9 chars -> 5-grams: knowl, nowle, owled, wledg, ledge
      expect(values).to.include('knowl')
      expect(values).to.include('nowle')
      expect(values).to.include('ledge')
      // "power" -> 5 chars -> one 5-gram
      expect(values).to.include('power')
      // "francis" -> 7 chars -> 5-grams
      expect(values).to.include('franc')
      // "bacon" -> 5 chars -> one 5-gram
      expect(values).to.include('bacon')
    })

    it('should split strings that mix numbers and letters and discard segments less than 2 in length', async () => {
      const { page } = await createPage('idx-ft-numeric', rootPageId, 'keyp3', { title: 'Year 2024 Report max1000 ad3flab5' })
      const dataId = page.id
      const values = await getIndexValues(dataId, page.version.version, 'fulltext')
      expect(values).to.include('2024')
      // "year" is 4 chars -> stored whole
      expect(values).to.include('year')
      // "report" -> 6 chars -> 5-grams
      expect(values).to.include('repor')
      expect(values).to.include('eport')
      // "max1000" is alphanumeric -> split into "max" and "1000"
      expect(values).to.include('max')
      expect(values).to.include('1000')
      // "ad3flab5" is alphanumeric -> split into "ad", "3", "flab", "5" -> "ad" is too short, "3" and "5" are numeric, so only "flab" should be included
      expect(values).to.include('flab')
      expect(values).to.not.include('ad')
      expect(values).to.not.include('3')
      expect(values).to.not.include('5')
    })

    it('should be searchable via phraseSearch after indexing', async () => {
      const uniqueWord = 'Xylophonist'
      const { page } = await createPage('idx-ft-search', rootPageId, 'keyp3', { title: `The Great ${uniqueWord}` })

      // search for it
      const { pages } = await query(`{ pages(filter: { phraseSearch: [{ query: "${uniqueWord}" }] }) { id name title } }`)
      expect(pages.map((p: any) => p.id)).to.include(page.id)
    })

    it('should support substring search with short query words', async () => {
      const { page } = await createPage('idx-ft-substr', rootPageId, 'keyp3', { title: 'Basketweaving Championship' })

      // substring search should find partial matches
      const { pages: withSubstring } = await query('{ pages(filter: { phraseSearch: [{ query: "basket", substring: true }] }) { id } }')
      expect(withSubstring.map((p: any) => p.id)).to.include(page.id)

      // non-substring search for a non-whole-word should not match
      const { pages: withoutSubstring } = await query('{ pages(filter: { phraseSearch: [{ query: "basket" }] }) { id } }')
      expect(withoutSubstring.map((p: any) => p.id)).to.not.include(page.id)
    })
  })
})
