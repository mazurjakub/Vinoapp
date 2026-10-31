/**
 * File: riskProjection.ts
 * Created: 2026-10-03
 * Description: Computes display-only index values for days not yet in the saved state, such as the forecast.
 */

import {
  goidanichDisplayPct,
  initialGoidanichCycleState,
  initialGublerThomasState,
  normalizeGoidanichCycleState,
  type DayHours,
  type GoidanichCycleOptions,
  type GoidanichCycleState,
  type GublerThomasState,
} from '../../rules'
import { foldDays, type DailyAccumulatorRecord } from './dailyAccumulator'
import { gublerStep, makeGoidanichStep } from './accumulatorSteps'

/**
 * Computes the index values for days that are NOT in the persisted state yet
 * (today and the forecast, plus any elapsed days a sync hasn't reached), by
 * running the same engine steps from the last confirmed state. Nothing here is
 * written back: the result is for display only.
 *
 * Days without a value to show, such as those before activation, after a cycle
 * ended or after `isSeasonOver`, have no entry, so the caller shows `null`.
 */
export function projectGoidanichPct(
  stored: DailyAccumulatorRecord<GoidanichCycleState> | undefined,
  resetFromDate: string,
  days: DayHours[],
  options: GoidanichCycleOptions,
  isSeasonOver: (date: string) => boolean = () => false,
): Map<string, number> {
  return projectGoidanich(stored, resetFromDate, days, options, isSeasonOver).pctByDate
}

/** The same projection, with the cycle state after its last day. */
export function projectGoidanich(
  stored: DailyAccumulatorRecord<GoidanichCycleState> | undefined,
  resetFromDate: string,
  days: DayHours[],
  options: GoidanichCycleOptions,
  isSeasonOver: (date: string) => boolean = () => false,
): { pctByDate: Map<string, number>; state: GoidanichCycleState } {
  const start: DailyAccumulatorRecord<GoidanichCycleState> =
    stored && stored.resetFromDate === resetFromDate
      ? { ...stored, state: normalizeGoidanichCycleState(stored.state, resetFromDate) }
      : { state: initialGoidanichCycleState(), lastProcessedDate: '', resetFromDate }

  const pctByDate = new Map<string, number>()
  let state = start.state
  foldDays({
    resetFromDate,
    start,
    days,
    step: makeGoidanichStep(options),
    onDay: (day, dayState) => {
      state = dayState
      const pct = goidanichDisplayPct(dayState, day.date)
      if (pct !== null && !isSeasonOver(day.date)) pctByDate.set(day.date, pct)
    },
  })
  return { pctByDate, state }
}

/** Gubler-Thomas score per day; `null` until the index has been ignited. */
export function projectGublerScore(
  stored: DailyAccumulatorRecord<GublerThomasState> | undefined,
  seasonStart: string,
  days: DayHours[],
  initialState: GublerThomasState = initialGublerThomasState(),
): Map<string, number | null> {
  const start: DailyAccumulatorRecord<GublerThomasState> =
    stored && stored.resetFromDate === seasonStart
      ? stored
      : { state: initialState, lastProcessedDate: '', resetFromDate: seasonStart }

  const scoreByDate = new Map<string, number | null>()
  foldDays({
    resetFromDate: seasonStart,
    start,
    days,
    step: (state, day) => gublerStep(state, day),
    onDay: (day, state) => scoreByDate.set(day.date, state.ignited ? state.score : null),
  })
  return scoreByDate
}
