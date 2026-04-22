import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Field, ID, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
import { type ScheduledPublishRow, type Page } from '../internal.js'

export enum ScheduledPublishAction {
  PUBLISH = 'PUBLISH',
  PUBLISH_WITH_SUBPAGES = 'PUBLISH_WITH_SUBPAGES',
  UNPUBLISH = 'UNPUBLISH'
}

registerEnumType(ScheduledPublishAction, {
  name: 'ScheduledPublishAction',
  description: 'The type of scheduled action to perform.',
  valuesConfig: {
    PUBLISH: { description: 'Publish the page only.' },
    PUBLISH_WITH_SUBPAGES: { description: 'Publish the page and all sub-pages.' },
    UNPUBLISH: { description: 'Unpublish the page and all sub-pages.' }
  }
})

export enum ScheduledPublishStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum ScheduledPublishRecurrence {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH'
}

registerEnumType(ScheduledPublishRecurrence, {
  name: 'ScheduledPublishRecurrence',
  description: 'The recurrence interval unit for a scheduled action.',
  valuesConfig: {
    DAY: { description: 'Recur every N days.' },
    WEEK: { description: 'Recur every N weeks.' },
    MONTH: { description: 'Recur every N months.' }
  }
})

registerEnumType(ScheduledPublishStatus, {
  name: 'ScheduledPublishStatus',
  description: 'The current status of a scheduled publish entry.',
  valuesConfig: {
    PENDING: { description: 'Scheduled and waiting to execute.' },
    COMPLETED: { description: 'Successfully executed.' },
    FAILED: { description: 'Attempted to execute but encountered an error.' },
    CANCELLED: { description: 'Cancelled by a user or by page deletion.' }
  }
})

@ObjectType({ description: 'Recurrence configuration for a scheduled action.' })
export class ScheduledPublishRecurrenceInfo {
  @Field(type => ScheduledPublishRecurrence)
  type: ScheduledPublishRecurrence

  @Field(type => Int, { description: 'Number of days/weeks/months between recurrences.' })
  interval: number

  @Field({ description: 'IANA timezone for DST-safe recurrence date calculation.' })
  timezone: string

  constructor (type: ScheduledPublishRecurrence, interval: number, timezone: string) {
    this.type = type
    this.interval = interval
    this.timezone = timezone
  }
}

@ObjectType({ description: 'A scheduled publish or unpublish action for a page.' })
export class ScheduledPublish {
  @Field(type => ID)
  id: string

  internalId: number
  pageInternalId: number
  pageDataId: string
  page?: Page

  @Field(type => ScheduledPublishAction)
  action: ScheduledPublishAction

  @Field({ description: 'The date and time at which this action will be executed.' })
  targetDate: DateTime

  @Field(type => ScheduledPublishStatus)
  status: ScheduledPublishStatus

  @Field(type => ScheduledPublishRecurrenceInfo, { nullable: true, description: 'Recurrence configuration. When set, a new schedule is automatically created after execution.' })
  recurrence?: ScheduledPublishRecurrenceInfo

  @Field({ nullable: true, description: 'Error message recorded when the scheduled action failed.' })
  error?: string

  @Field({ description: 'True when this entry represents an immediate publish/unpublish rather than one that was scheduled in advance.' })
  immediate: boolean

  @Field()
  createdAt: DateTime

  createdBy: string

  @Field()
  updatedAt: DateTime

  updatedBy: string

  constructor (row: ScheduledPublishRow) {
    this.internalId = row.id
    this.id = String(row.id)
    this.pageInternalId = row.pageInternalId
    this.pageDataId = String(row.pageDataId ?? row.dataId)
    this.action = row.action as ScheduledPublishAction
    this.targetDate = DateTime.fromJSDate(row.targetDate)
    this.status = row.status as ScheduledPublishStatus
    this.recurrence = row.recur ? new ScheduledPublishRecurrenceInfo(row.recur, row.recurInterval ?? 1, row.timezone ?? 'America/Chicago') : undefined
    this.error = row.error ?? undefined
    this.immediate = row.targetDate.getTime() === row.createdAt.getTime()
    this.createdAt = DateTime.fromJSDate(row.createdAt)
    this.createdBy = row.createdBy
    this.updatedAt = DateTime.fromJSDate(row.updatedAt)
    this.updatedBy = row.updatedBy
  }
}

@InputType()
export class ScheduledPublishFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  internalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Filter by page data IDs.' })
  pageIds?: string[]

  pageInternalIds?: number[]

  @Field(type => [ScheduledPublishAction], { nullable: true })
  actions?: ScheduledPublishAction[]

  @Field(type => [ScheduledPublishStatus], { nullable: true, description: 'Filter by status. Defaults to [PENDING] if not specified.' })
  statuses?: ScheduledPublishStatus[]

  @Field({ nullable: true, description: 'Return schedules with target date before this date.' })
  targetDateBefore?: DateTime

  @Field({ nullable: true, description: 'Return schedules with target date after this date.' })
  targetDateAfter?: DateTime

  @Field(type => Boolean, { nullable: true, description: 'Filter by immediate vs scheduled. null returns all, true returns only immediate publishes, false returns only scheduled publishes.' })
  immediate?: boolean
}

@InputType({ description: 'Recurrence configuration input.' })
export class ScheduledPublishRecurrenceInput {
  @Field(type => ScheduledPublishRecurrence)
  type!: ScheduledPublishRecurrence

  @Field(type => Int, { nullable: true, description: 'Number of days/weeks/months between recurrences. Defaults to 1.' })
  interval?: number

  @Field({ nullable: true, description: 'IANA timezone for DST-safe recurrence date calculation. Defaults to server timezone.' })
  timezone?: string
}

@InputType()
export class CreateScheduledPublishInput {
  @Field(type => ID)
  pageId!: string

  @Field(type => ScheduledPublishAction)
  action!: ScheduledPublishAction

  @Field({ description: 'The date and time to execute the action. Must be at least 5 minutes in the future.' })
  targetDate!: DateTime

  @Field(type => ScheduledPublishRecurrenceInput, { nullable: true, description: 'Recurrence configuration. When set, a new schedule is automatically created after execution.' })
  recurrence?: ScheduledPublishRecurrenceInput
}

@InputType()
export class UpdateScheduledPublishInput {
  @Field(type => ScheduledPublishAction)
  action!: ScheduledPublishAction

  @Field({ description: 'New target date. Must be at least 5 minutes in the future.' })
  targetDate!: DateTime

  @Field(type => ScheduledPublishRecurrenceInput, { nullable: true, description: 'Recurrence configuration. Set to null to remove recurrence.' })
  recurrence?: ScheduledPublishRecurrenceInput | null
}

@ObjectType()
export class ScheduledPublishResponse extends ValidatedResponse {
  @Field({ nullable: true })
  scheduledPublish?: ScheduledPublish

  constructor (config?: ValidatedResponseArgs & { scheduledPublish?: ScheduledPublish }) {
    super(config ?? {})
    this.scheduledPublish = config?.scheduledPublish
  }
}

@ObjectType()
export class ScheduledPublishPermissions {}
