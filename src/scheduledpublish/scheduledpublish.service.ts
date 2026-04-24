import { BaseService, MutationMessageType } from '@txstate-mws/graphql-server'
import { OneToManyLoader, PrimaryKeyLoader } from 'dataloader-factory'
import { DateTime } from 'luxon'
import {
  DosGatoService, type ScheduledPublishFilter, type ScheduledPublish, ScheduledPublishStatus,
  ScheduledPublishAction, ScheduledPublishRecurrence, ScheduledPublishResponse, type CreateScheduledPublishInput,
  type UpdateScheduledPublishInput, PageServiceInternal, PageService, type PaginationResponse,
  getScheduledPublishes, countScheduledPublishes, createScheduledPublish, updateScheduledPublish,
  updateScheduledPublishStatus, userContext
} from '../internal.js'

const scheduledPublishByIdLoader = new PrimaryKeyLoader({
  fetch: async (ids: number[]) => {
    return await getScheduledPublishes({ internalIds: ids, statuses: [ScheduledPublishStatus.PENDING, ScheduledPublishStatus.COMPLETED, ScheduledPublishStatus.FAILED, ScheduledPublishStatus.CANCELLED] })
  },
  extractId: (item: ScheduledPublish) => item.internalId
})

const scheduledPublishByPageInternalIdLoader = new OneToManyLoader({
  fetch: async (pageInternalIds: number[], filter?: ScheduledPublishFilter) => {
    return await getScheduledPublishes({ ...filter, pageInternalIds })
  },
  extractKey: (sp: ScheduledPublish) => sp.pageInternalId,
  idLoader: scheduledPublishByIdLoader
})

export class ScheduledPublishServiceInternal extends BaseService {
  async find (filter?: ScheduledPublishFilter, pageInfo?: PaginationResponse) {
    const schedules = await getScheduledPublishes(filter, undefined, pageInfo)
    for (const sp of schedules) {
      this.loaders.get(scheduledPublishByIdLoader).prime(sp.internalId, sp)
    }
    return schedules
  }

  async findById (id: number) {
    return await this.loaders.get(scheduledPublishByIdLoader).load(id)
  }

  async findByPageInternalId (pageInternalId: number, filter?: ScheduledPublishFilter) {
    return await this.loaders.get(scheduledPublishByPageInternalIdLoader, filter).load(pageInternalId)
  }

  async count (filter?: ScheduledPublishFilter) {
    return await countScheduledPublishes(filter)
  }
}

export class ScheduledPublishService extends DosGatoService<ScheduledPublish> {
  raw = this.svc(ScheduledPublishServiceInternal)

  async find (filter?: ScheduledPublishFilter, pageInfo?: PaginationResponse) {
    const schedules = await this.raw.find(filter, pageInfo)
    await this.loadPages(schedules)
    return this.removeUnauthorized(schedules)
  }

  async findById (id: number) {
    const sp = await this.raw.findById(id)
    if (sp) await this.loadPages([sp])
    return this.removeUnauthorized(sp)
  }

  async findByPageInternalId (pageInternalId: number, filter?: ScheduledPublishFilter) {
    const schedules = await this.raw.findByPageInternalId(pageInternalId, filter)
    await this.loadPages(schedules)
    return this.removeUnauthorized(schedules)
  }

  async count (filter?: ScheduledPublishFilter) {
    return await this.raw.count(filter)
  }

  mayView (sp: ScheduledPublish) {
    if (!sp.page) return false
    return this.svc(PageService).mayViewForEdit(sp.page)
  }

  private async loadPages (schedules: ScheduledPublish[]) {
    const pageSvc = this.svc(PageServiceInternal)
    await Promise.all(schedules.map(async sp => {
      sp.page ??= await pageSvc.findByInternalId(sp.pageInternalId)
    }))
  }

  async create (args: CreateScheduledPublishInput, validateOnly?: boolean) {
    const page = await this.svc(PageServiceInternal).findById(args.pageId)
    if (!page) throw new Error('Page not found.')
    const parent = page.parentInternalId ? await this.svc(PageServiceInternal).findByInternalId(page.parentInternalId) : null
    const pageSvc = this.svc(PageService)
    const response = new ScheduledPublishResponse({ success: true })
    if (args.action === ScheduledPublishAction.UNPUBLISH) {
      if (!await pageSvc.mayScheduleUnpublish(page)) throw new Error('You are not permitted to schedule an unpublish for this page, or an active unpublish schedule already exists.')
    } else {
      if (!await pageSvc.maySchedulePublish(page)) throw new Error('You are not permitted to schedule a publish for this page, or an active publish schedule already exists.')
      if (parent && !parent.published) response.addMessage('This page\'s parent is not published. If the parent page is still not published at the targeted time, this scheduled publish will fail.', 'targetDate', MutationMessageType.warning)
    }
    validate(response, args)
    if (response.hasErrors() || validateOnly) return response
    const recurrence = args.recurrence
      ? { recur: args.recurrence.type, recurInterval: args.recurrence.interval ?? 1, timezone: args.recurrence.timezone ?? process.env.TZ ?? 'America/Chicago' }
      : undefined
    const id = await createScheduledPublish(
      page.internalId,
      args.action,
      args.targetDate.toJSDate(),
      this.login,
      recurrence
    )
    this.loaders.clear()
    const created = await this.raw.findById(id)
    response.scheduledPublish = created
    return response
  }

  async update (scheduledPublishId: string, args: UpdateScheduledPublishInput, validateOnly?: boolean) {
    const schedule = await this.raw.findById(Number(scheduledPublishId))
    if (!schedule || !await this.mayEdit(schedule)) throw new Error('You are not permitted to edit this schedule.')
    if ((schedule.action === ScheduledPublishAction.UNPUBLISH && args.action !== ScheduledPublishAction.UNPUBLISH) ||
      (schedule.action !== ScheduledPublishAction.UNPUBLISH && args.action === ScheduledPublishAction.UNPUBLISH)) {
      throw new Error('An unpublish schedule cannot be changed to a publish schedule, and vice versa.')
    }
    const response = new ScheduledPublishResponse({ success: true })
    validate(response, args)
    if (response.hasErrors() || validateOnly) return response
    await updateScheduledPublish(schedule.internalId, {
      action: args.action,
      targetDate: args.targetDate.toJSDate(),
      recur: args.recurrence?.type ?? null,
      recurInterval: args.recurrence ? (args.recurrence.interval ?? 1) : null,
      timezone: args.recurrence ? (args.recurrence.timezone ?? process.env.TZ ?? 'America/Chicago') : null,
      updatedBy: this.login
    })
    this.loaders.clear()
    const updated = await this.raw.findById(schedule.internalId)
    response.scheduledPublish = updated
    return response
  }

  async cancel (scheduledPublishId: string) {
    const schedule = await this.raw.findById(Number(scheduledPublishId))
    if (!schedule || !await this.mayCancel(schedule)) throw new Error('You are not permitted to cancel this schedule.')
    await updateScheduledPublishStatus(schedule.internalId, ScheduledPublishStatus.CANCELLED)
    this.loaders.clear()
    const cancelled = await this.raw.findById(schedule.internalId)
    return new ScheduledPublishResponse({ success: true, scheduledPublish: cancelled })
  }

  async mayEdit (schedule: ScheduledPublish) {
    if (schedule.status !== ScheduledPublishStatus.PENDING) return false
    const page = schedule.page ?? await this.svc(PageServiceInternal).findByInternalId(schedule.pageInternalId)
    if (!page) return false
    if (schedule.action === ScheduledPublishAction.UNPUBLISH) {
      return await this.svc(PageService).mayScheduleUnpublish(page, schedule.internalId)
    } else {
      return await this.svc(PageService).maySchedulePublish(page, schedule.internalId)
    }
  }

  async mayCancel (schedule: ScheduledPublish) {
    return await this.mayEdit(schedule)
  }

  async actionNotPermitted (schedule: ScheduledPublish) {
    if (schedule.status !== ScheduledPublishStatus.PENDING) return false
    const page = schedule.page ?? await this.svc(PageServiceInternal).findByInternalId(schedule.pageInternalId)
    if (!page) return false
    const ctx = await userContext(schedule.updatedBy)
    if (schedule.action === ScheduledPublishAction.UNPUBLISH) {
      return !(await ctx.svc(PageService).checkPerm(page, 'unpublish', false))
    } else {
      return !(await ctx.svc(PageService).checkPerm(page, 'unpublish', false))
    }
  }
}

const maxRecurInterval: Record<ScheduledPublishRecurrence, number> = {
  [ScheduledPublishRecurrence.DAY]: 365,
  [ScheduledPublishRecurrence.WEEK]: 52,
  [ScheduledPublishRecurrence.MONTH]: 12
}

function validate (response: ScheduledPublishResponse, args: CreateScheduledPublishInput | UpdateScheduledPublishInput) {
  if (args.targetDate <= DateTime.now().plus({ minutes: 5 })) {
    response.addMessage('Target date must be at least 5 minutes in the future.', 'args.targetDate', MutationMessageType.error)
  }
  if (args.targetDate > DateTime.now().plus({ years: 1 })) {
    response.addMessage('Target date may not be more than a year in the future.', 'args.targetDate', MutationMessageType.error)
  }
  if (args.recurrence) {
    const interval = args.recurrence.interval ?? 1
    if (interval < 1) {
      response.addMessage('Recurrence interval must be at least 1.', 'args.recurrence.interval', MutationMessageType.error)
    } else if (interval > maxRecurInterval[args.recurrence.type]) {
      response.addMessage(`Recurrence interval may not exceed ${maxRecurInterval[args.recurrence.type]} for ${args.recurrence.type} recurrence.`, 'args.recurrence.interval', MutationMessageType.error)
    }
  }
}
