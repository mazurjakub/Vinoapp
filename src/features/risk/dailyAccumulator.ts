/**
 * File: dailyAccumulator.ts
 * Created: 2026-10-03
 * Description: Generic accumulator that folds daily weather into a saved season state.
 */

import { getSetting, setSetting } from '../../db/settingsRepo'
import type { DayHours } from '../../rules'

export interface DailyAccumulatorRecord<S> {
  state: S
  /** Last calendar day (YYYY-MM-DD) already folded into `state`. '' = none yet. */
  lastProcessedDate: string
  /** The basis this run started from (e.g. budbreak date, or an event date). */
  resetFromDate: string
  /** The state after the last day that won't be recomputed any more. */
  checkpoint?: { date: string; state: S }
}

export type DayStep<S> = (state: S, day: DayHours, context: { isFirst: boolean; previousDay: DayHours | undefined }) => S

export interface FoldDaysOptions<S> {
  resetFromDate: string
  /** State and bookkeeping to continue from (a stored record, or the initial state). */
  start: DailyAccumulatorRecord<S>
  days: DayHours[]
  step: DayStep<S>
  /** Called after each day is folded in, with the state as of that day. */
  onDay?: (day: DayHours, stateAfterDay: S) => void
}

export interface FoldDaysResult<S> extends DailyAccumulatorRecord<S> {
  newlyProcessedDays: DayHours[]
}

/** The day loop shared by the sync and the projection. Skips days before resetFromDate and days already processed. */
export function foldDays<S>(options: FoldDaysOptions<S>): FoldDaysResult<S> {
  const { resetFromDate, start, step, onDay } = options
  const sortedDays = [...options.days].sort((a, b) => a.date.localeCompare(b.date))

  let state = start.state
  let lastProcessedDate = start.lastProcessedDate
  let hasProcessedAny = lastProcessedDate !== ''
  const newlyProcessedDays: DayHours[] = []
  let previousDay: DayHours | undefined

  for (const day of sortedDays) {
    const beforeReset = day.date < resetFromDate
    const alreadyDone = lastProcessedDate !== '' && day.date <= lastProcessedDate
    if (beforeReset || alreadyDone) {
      previousDay = day
      continue
    }
    state = step(state, day, { isFirst: !hasProcessedAny, previousDay })
    lastProcessedDate = day.date
    hasProcessedAny = true
    newlyProcessedDays.push(day)
    onDay?.(day, state)
    previousDay = day
  }

  return { state, lastProcessedDate, resetFromDate, newlyProcessedDays }
}

export interface SyncDailyAccumulatorOptions<S> {
  settingsKey: string
  resetFromDate: string
  initialState: S
  /** Elapsed days, in any order. */
  days: DayHours[]
  step: DayStep<S>
  /** Start again from resetFromDate. The stored record is only overwritten at the end. */
  fresh?: boolean
  /** Continue from the stored checkpoint instead of the stored state, folding the later days again. */
  fromCheckpoint?: boolean
  /** Days before this date are final: the checkpoint follows the last of them. */
  checkpointBefore?: string
  /** Called after each day is folded in, with the state as of that day (for per-day snapshots). */
  onDay?: (day: DayHours, stateAfterDay: S) => void
}

export interface SyncDailyAccumulatorResult<S> extends DailyAccumulatorRecord<S> {
  /** Days actually processed by this call. */
  newlyProcessedDays: DayHours[]
}

/**
 * Day-by-day accumulator stored under `settingsKey`. Continues from the stored state,
 * a changed `resetFromDate` (e.g. a corrected budbreak date) starts over.
 */
export async function syncDailyAccumulator<S>(
  options: SyncDailyAccumulatorOptions<S>,
): Promise<SyncDailyAccumulatorResult<S>> {
  const { settingsKey, resetFromDate, initialState, step, onDay, fromCheckpoint, checkpointBefore } = options

  const stored = options.fresh ? undefined : await getSetting<DailyAccumulatorRecord<S>>(settingsKey)
  const resuming = stored !== undefined && stored.resetFromDate === resetFromDate
  const storedCheckpoint = resuming ? stored.checkpoint : undefined
  const start: DailyAccumulatorRecord<S> = !resuming
    ? { state: initialState, lastProcessedDate: '', resetFromDate }
    : fromCheckpoint && storedCheckpoint
      ? { state: storedCheckpoint.state, lastProcessedDate: storedCheckpoint.date, resetFromDate }
      : stored

  let checkpoint =
    checkpointBefore !== undefined && start.lastProcessedDate !== '' && start.lastProcessedDate < checkpointBefore
      ? { date: start.lastProcessedDate, state: start.state }
      : storedCheckpoint
  const folded = foldDays({
    resetFromDate,
    start,
    days: options.days,
    step,
    onDay: (day, state) => {
      if (checkpointBefore !== undefined && day.date < checkpointBefore) checkpoint = { date: day.date, state }
      onDay?.(day, state)
    },
  })
  const record: DailyAccumulatorRecord<S> = {
    state: folded.state,
    lastProcessedDate: folded.lastProcessedDate,
    resetFromDate,
    ...(checkpoint ? { checkpoint } : {}),
  }
  await setSetting(settingsKey, record)
  return { ...record, newlyProcessedDays: folded.newlyProcessedDays }
}
