/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { query, queryAs } from '../common.js'
import db from 'mysql2-async/db'
import { DateTime } from 'luxon'

chai.use(chaiAsPromised)

async function createPage (name: string, parentId: string, templateKey: string, username?: string) {
  const data = { savedAtVersion: '20220710120000', templateKey, title: 'Test Title' }
  const { createPage: { success, page } } = await queryAs((username ?? 'su01'), 'mutation CreatePage ($name: UrlSafeString!, $data: JsonData!, $targetId: ID!) { createPage (name: $name, data: $data, targetId: $targetId) { success page { id name } } }', { name, targetId: parentId, data })
  return { success, page }
}

async function publishPage (pageId: string) {
  const { publishPages: { success } } = await query('mutation PublishPages ($pageIds: [ID!]!) { publishPages (pageIds: $pageIds) { success } }', { pageIds: [pageId] })
  return success
}

function futureDate (minutes: number) {
  return DateTime.now().plus({ minutes }).toISO()
}

describe('scheduled publishes', () => {
  let testSite6PageRootId: string
  let testPageId: string
  let testScheduleId: string
  let publishedPageId: string

  before(async () => {
    const { sites } = await query('{ sites { id name rootPage { id } } }')
    const site6 = sites.find((s: any) => s.name === 'site6')
    testSite6PageRootId = site6.rootPage.id
    await publishPage(testSite6PageRootId)

    const { page: testPage } = await createPage('schedpub-test1', testSite6PageRootId, 'keyp2')
    testPageId = testPage.id

    const { page: pubPage } = await createPage('schedpub-test2', testSite6PageRootId, 'keyp2')
    publishedPageId = pubPage.id
    await publishPage(publishedPageId)
  })

  it('should create a scheduled publish', async () => {
    const { createScheduledPublish: { success, scheduledPublish } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id action targetDate status page { id } }
        }
      }`, { args: { pageId: testPageId, action: 'PUBLISH', targetDate: futureDate(10) } })
    expect(success).to.be.true
    expect(scheduledPublish.action).to.equal('PUBLISH')
    expect(scheduledPublish.status).to.equal('PENDING')
    expect(scheduledPublish.page.id).to.equal(testPageId)
    testScheduleId = scheduledPublish.id
  })
  it('should create a scheduled unpublish', async () => {
    const { createScheduledPublish: { success, scheduledPublish } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id action status }
        }
      }`, { args: { pageId: publishedPageId, action: 'UNPUBLISH', targetDate: futureDate(10) } })
    expect(success).to.be.true
    expect(scheduledPublish.action).to.equal('UNPUBLISH')
    expect(scheduledPublish.status).to.equal('PENDING')
  })
  it('should reject a target date less than 5 minutes in the future', async () => {
    const { updateScheduledPublish: { success, messages } } = await query(`
      mutation UpdateScheduledPublish ($id: ID!, $args: UpdateScheduledPublishInput!) {
        updateScheduledPublish (scheduledPublishId: $id, args: $args) {
          success
          messages { message }
        }
      }`, { id: testScheduleId, args: { action: 'PUBLISH', targetDate: futureDate(2) } })
    expect(success).to.be.false
    expect(messages.some((m: any) => m.message.includes('5 minutes'))).to.be.true
  })
  it('should reject a target date more than a year in the future', async () => {
    const farFuture = DateTime.now().plus({ years: 1, days: 1 }).toISO()
    const { updateScheduledPublish: { success, messages } } = await query(`
      mutation UpdateScheduledPublish ($id: ID!, $args: UpdateScheduledPublishInput!) {
        updateScheduledPublish (scheduledPublishId: $id, args: $args) {
          success
          messages { message }
        }
      }`, { id: testScheduleId, args: { action: 'PUBLISH', targetDate: farFuture } })
    expect(success).to.be.false
    expect(messages.some((m: any) => m.message.includes('year'))).to.be.true
  })
  it('should not allow an unauthorized user to create a scheduled publish', async () => {
    await expect(queryAs('ed07', `
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: testPageId, action: 'PUBLISH', targetDate: futureDate(10) } })).to.be.rejected
  })
  it('should retrieve scheduled publishes with default pending filter', async () => {
    const { scheduledPublishes } = await query('{ scheduledPublishes { id action status targetDate page { id name } } }')
    expect(scheduledPublishes.length).to.be.greaterThan(0)
    for (const sp of scheduledPublishes) {
      expect(sp.status).to.equal('PENDING')
    }
  })
  it('should filter scheduled publishes by action', async () => {
    const { scheduledPublishes } = await query('{ scheduledPublishes(filter: { actions: [PUBLISH] }) { id action } }')
    for (const sp of scheduledPublishes) {
      expect(sp.action).to.not.equal('UNPUBLISH')
    }
  })
  it('should create a scheduled publish with recurrence', async () => {
    const { page } = await createPage('schedpub-recur', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { success, scheduledPublish } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id action recurrence { type interval timezone } }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10), recurrence: { type: 'WEEK', interval: 2, timezone: 'America/Chicago' } } })
    expect(success).to.be.true
    expect(scheduledPublish.recurrence.type).to.equal('WEEK')
    expect(scheduledPublish.recurrence.interval).to.equal(2)
    expect(scheduledPublish.recurrence.timezone).to.equal('America/Chicago')
  })
  it('should update a scheduled publish', async () => {
    const { page } = await createPage('schedpub-update', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    const newDate = futureDate(60)
    const { updateScheduledPublish: { success, scheduledPublish: updated } } = await query(`
      mutation UpdateScheduledPublish ($id: ID!, $args: UpdateScheduledPublishInput!) {
        updateScheduledPublish (scheduledPublishId: $id, args: $args) {
          success
          scheduledPublish { id action targetDate }
        }
      }`, { id: created.id, args: { action: 'PUBLISH_WITH_SUBPAGES', targetDate: newDate } })
    expect(success).to.be.true
    expect(updated.action).to.equal('PUBLISH_WITH_SUBPAGES')
  })
  it('should not allow changing a publish schedule to unpublish', async () => {
    const { page } = await createPage('schedpub-noswitch', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    await expect(query(`
      mutation UpdateScheduledPublish ($id: ID!, $args: UpdateScheduledPublishInput!) {
        updateScheduledPublish (scheduledPublishId: $id, args: $args) {
          success
        }
      }`, { id: created.id, args: { action: 'UNPUBLISH', targetDate: futureDate(15) } })).to.be.rejected
  })
  it('should cancel a scheduled publish', async () => {
    const { page } = await createPage('schedpub-cancel', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    const { cancelScheduledPublish: { success, scheduledPublish: cancelled } } = await query(`
      mutation CancelScheduledPublish ($id: ID!) {
        cancelScheduledPublish (scheduledPublishId: $id) {
          success
          scheduledPublish { id status }
        }
      }`, { id: created.id })
    expect(success).to.be.true
    expect(cancelled.status).to.equal('CANCELLED')
  })
  it('should not allow an unauthorized user to cancel a scheduled publish', async () => {
    const { page } = await createPage('schedpub-cancel2', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    await expect(queryAs('ed07', `
      mutation CancelScheduledPublish ($id: ID!) {
        cancelScheduledPublish (scheduledPublishId: $id) {
          success
        }
      }`, { id: created.id })).to.be.rejected
  })
  it('should return permissions for a scheduled publish', async () => {
    const { scheduledPublishes } = await query('{ scheduledPublishes { id permissions { edit cancel } } }')
    expect(scheduledPublishes.length).to.be.greaterThan(0)
    // su01 is superuser, should have edit and cancel permissions on pending schedules
    for (const sp of scheduledPublishes) {
      expect(sp.permissions.edit).to.be.true
      expect(sp.permissions.cancel).to.be.true
    }
  })
  it('should report actionNotPermitted as false when the updatedBy user still has permission', async () => {
    const { page } = await createPage('schedpub-perm1', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    const { scheduledPublishes } = await query(`{ scheduledPublishes(filter: { ids: ["${created.id}"] }) { id actionNotPermitted } }`)
    expect(scheduledPublishes).to.have.lengthOf(1)
    expect(scheduledPublishes[0].actionNotPermitted).to.be.false
  })
  it('should report actionNotPermitted as true when the updatedBy user no longer has permission', async () => {
    // create a page and schedule a publish as su01
    const { page } = await createPage('schedpub-perm2', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    // directly update the updatedBy to ed19 (disabled user who has pagerolestest1 but no access due to being disabled)
    await db.update('UPDATE scheduledpublishes SET updatedBy = ? WHERE id = ?', ['ed19', created.id])

    const { scheduledPublishes } = await query(`{ scheduledPublishes(filter: { ids: ["${created.id}"] }) { id actionNotPermitted updatedByUser { id } } }`)
    expect(scheduledPublishes).to.have.lengthOf(1)
    expect(scheduledPublishes[0].updatedByUser.id).to.equal('ed19')
    expect(scheduledPublishes[0].actionNotPermitted).to.be.true
  })
  it('should report actionNotPermitted as false for non-pending schedules', async () => {
    const { page } = await createPage('schedpub-perm3', testSite6PageRootId, 'keyp2')
    const { createScheduledPublish: { scheduledPublish: created } } = await query(`
      mutation CreateScheduledPublish ($args: CreateScheduledPublishInput!) {
        createScheduledPublish (args: $args) {
          success
          scheduledPublish { id }
        }
      }`, { args: { pageId: page.id, action: 'PUBLISH', targetDate: futureDate(10) } })

    // cancel it, then check actionNotPermitted
    await query(`mutation CancelScheduledPublish ($id: ID!) { cancelScheduledPublish (scheduledPublishId: $id) { success } }`, { id: created.id })

    const { scheduledPublishes } = await query(`{ scheduledPublishes(filter: { ids: ["${created.id}"], statuses: [CANCELLED] }) { id status actionNotPermitted } }`)
    expect(scheduledPublishes).to.have.lengthOf(1)
    expect(scheduledPublishes[0].status).to.equal('CANCELLED')
    expect(scheduledPublishes[0].actionNotPermitted).to.be.false
  })
})
