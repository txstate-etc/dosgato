import {
  getDueSchedules, updateScheduledPublishStatus, createScheduledPublish, ScheduledPublishStatus,
  ScheduledPublishAction, ScheduledPublishRecurrence, PageService, userContext
} from '../internal.js'

const recurDurationKey: Record<ScheduledPublishRecurrence, 'days' | 'weeks' | 'months'> = {
  [ScheduledPublishRecurrence.DAY]: 'days',
  [ScheduledPublishRecurrence.WEEK]: 'weeks',
  [ScheduledPublishRecurrence.MONTH]: 'months'
}

export async function executeScheduledPublishes () {
  const due = await getDueSchedules()
  for (const schedule of due) {
    let permissionsError = false
    try {
      const ctx = await userContext(schedule.updatedBy)
      if (schedule.action === ScheduledPublishAction.UNPUBLISH) {
        await ctx.svc(PageService).unpublishPages([schedule.pageDataId])
      } else {
        await ctx.svc(PageService).publishPages([schedule.pageDataId], schedule.action === ScheduledPublishAction.PUBLISH_WITH_SUBPAGES)
      }
      await updateScheduledPublishStatus(schedule.internalId, ScheduledPublishStatus.COMPLETED)
    } catch (err: any) {
      console.error('Scheduled publish failed:', err)
      permissionsError = err.message.includes('permitted')
      await updateScheduledPublishStatus(schedule.internalId, ScheduledPublishStatus.FAILED, err.message)
    }
    if (schedule.recurrence && !permissionsError) {
      try {
        const { type, interval, timezone } = schedule.recurrence
        const nextDate = schedule.targetDate
          .setZone(timezone)
          .plus({ [recurDurationKey[type]]: interval })
        await createScheduledPublish(
          schedule.pageInternalId,
          schedule.action,
          nextDate.toJSDate(),
          schedule.updatedBy,
          { recur: type, recurInterval: interval, timezone }
        )
      } catch (err: any) {
        console.error('Failed to reschedule recurring publish:', err)
      }
    }
  }
}
