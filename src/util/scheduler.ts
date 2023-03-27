import { DateTime } from 'luxon'
import { type Queryable } from 'mysql2-async'
import db from 'mysql2-async/db'
import { sleep } from 'txstate-utils'

export interface SchedulerOpts {
  /**
   * Minimum number of minutes that need to go by before the task will be run again.
   *
   * For instance, if you set this to 30, the task will run approximately every 30 minutes.
   *
   * If there is downtime, the task will likely run immediately after startup.
   */
  minutesBetween?: number
  /**
   * Task will only execute during the given hour, if it has been long enough
   * since the last execution to satisfy minutesBetween.
   *
   * Hour is in the API container's time zone, be sure to set it appropriately with the
   * TZ environment variable.
   *
   * Starts with 0 (12am-1am), ends at 23 (11pm-12am)
   *
   * For a nightly task that should only execute once, set this to the desired hour
   * and minutesBetween > 60. Smaller minutesBetween will mean more executions during
   * that hour.
   */
  duringHour?: number
  /**
   * Task will only execute during the given day of the week.
   *
   * 1 is Monday and 7 is Sunday
   *
   * Best used with duringHour or with minutesBetween > 24 * 60 - note that if
   * minutesBetween is small, the task will execute many times on the given day.
   */
  duringDayOfWeek?: DayOfWeek
  /**
   * Task will only execute during the given day of the month.
   *
   * Starts with 1
   *
   * Best used with duringHour or with minutesBetween > 24 * 60 - note that if
   * minutesBetween is small, the task will execute many times on the given day.
   */
  duringDayOfMonth?: number
}

export type SchedulerJob = () => Promise<void> | void

export enum DayOfWeek {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
  SUNDAY = 7
}

class Scheduler {
  protected jobs = new Map<string, { job: SchedulerJob } & SchedulerOpts & { minutesBetween: number }>()
  protected started = false
  async schedule (jobname: string, job: SchedulerJob, opts: SchedulerOpts) {
    const lcJobName = jobname.toLocaleLowerCase()
    if (this.jobs.has(lcJobName)) throw new Error('Tried to schedule two jobs with the same name. Please pick a more unique job name.')
    const minutesBetween = opts.minutesBetween ?? ((opts.duringHour ? 60 : 24 * 60) + 5)
    await db.insert('INSERT IGNORE INTO tasks (name) VALUES (?)', [jobname])
    this.jobs.set(lcJobName, { ...opts, minutesBetween, job })
    this.start().catch(console.error)
  }

  async start () {
    if (this.started) return
    this.started = true
    while (true) {
      await sleep(90 * 1000)
      const now = DateTime.local()
      const currentHour = now.hour
      const currentDOW = now.weekday
      const currentDOM = now.day
      await Promise.all(Array.from(this.jobs.entries()).map(async ([jobname, config]) => {
        if (config.duringHour && currentHour !== config.duringHour) return
        if (config.duringDayOfWeek && currentDOW !== config.duringDayOfWeek) return
        if (config.duringDayOfMonth && currentDOM !== config.duringDayOfMonth) return
        try {
          const claimed = await db.update('UPDATE tasks SET lastBegin=NOW(), inProgress=1 WHERE name=:name AND lastBegin < NOW() - INTERVAL :minutes MINUTE AND (inProgress=0 OR lastBegin < NOW - INTERVAL (:minutes * 2) MINUTE)', { name: jobname, minutes: config.minutesBetween })
          if (claimed) await this.jobs.get(jobname)!.job()
        } catch (e: any) {
          console.error(e)
        } finally {
          try {
            await db.update('UPDATE tasks SET inProgress=0 WHERE name=?', [jobname])
          } catch (e: any) {
            console.error(e)
          }
        }
      }))
    }
  }

  static async createTable (db: Queryable) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        name VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL,
        lastBegin DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        retries: TINYINT UNSIGNED NOT NULL DEFAULT 0
        PRIMARY KEY (name)
      )
      ENGINE = InnoDB
      DEFAULT CHARACTER SET = utf8mb4
      DEFAULT COLLATE = utf8mb4_general_ci
    `)
  }
}

export const scheduler = new Scheduler()
