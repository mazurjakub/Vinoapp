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

/**
 * The day loop shared by the persisted sync and the in-memory projection.
 * Pure: it reads nothing and writes nothing. Days before `resetFromDate` and
 * days already covered by `start.lastProcessedDate` are skipped, so passing
 * overlapping `days` never double-counts.
 */
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
  /** All available *elapsed* days (any order; days before `resetFromDate` or already processed are skipped). */
  days: DayHours[]
  step: DayStep<S>
  /**
   * Ignore whatever is stored and fold `days` from `resetFromDate` on. The
   * stored record is still only overwritten at the end, so a failure part
   * way through leaves the previous state in place.
   */
  fresh?: boolean
  /** Continue from the stored checkpoint instead of the stored state, folding the later days again. */
  fromCheckpoint?: boolean
  /** Days before this date are final: the checkpoint follows the last of them. */
  checkpointBefore?: string
  /** Called after each day is folded in, with the state as of that day (for per-day snapshots). */
  onDay?: (day: DayHours, stateAfterDay: S) => void
}

export interface SyncDailyAccumulatorResult<S> extends DailyAccumulatorRecord<S> {
  /** Days that were actually folded into `state` by this call (empty if everything was already processed). */
  newlyProcessedDays: DayHours[]
}

/**
 * Generic persisted day-by-day accumulator. Resumes from whatever was
 * stored under `settingsKey` as long as `resetFromDate` matches what's
 * stored. A changed `resetFromDate` (a corrected budbreak date, or an earlier
 * primary-infection date found on reprocessing) means "start over from
 * scratch". Calling this repeatedly with overlapping `days` is always safe.
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
