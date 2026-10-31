/**
 * File: goidanichCycle.ts
 * Created: 2026-10-31
 * Description: Tracks one Goidanich incubation cycle from its infection event to its end.
 */

import { advanceGoidanichState, initialGoidanichState, URGENT_THRESHOLD_PCT, type GoidanichState } from './goidanichStateMachine'
import type { RiskReason } from './types'
import { addDaysUTC, dailyMeanHumidity, dailyMeanTemperature, daysBetween, hasConsecutiveWetHours, type DayHours } from './weatherMath'

export type GoidanichCycleStatus = 'none' | 'running' | 'complete' | 'stalled'

/** Bump when the calculation changes: a stored state from another version is replayed by the next sync. */
export const GOIDANICH_ENGINE_VERSION = 3

/** A day with fewer valid hours adds nothing, because its mean could miss the night or the afternoon. */
export const GOIDANICH_MIN_HOURS_PER_DAY = 18

/** The percentage is incubation progress, so it pauses in the cold and never falls. */
export interface GoidanichCycleState extends GoidanichState {
  status: GoidanichCycleStatus
  startDate: string | null
  endDate: string | null
  lastGrowthDate: string | null
  daysWithoutGrowth: number
  engineVersion: number
}

export interface GoidanichCycleOptions {
  primaryEventDates: ReadonlySet<string>
  stallDays: number
  requireWetHours?: boolean
}

export function initialGoidanichCycleState(): GoidanichCycleState {
  return {
    ...initialGoidanichState(),
    status: 'none',
    startDate: null,
    endDate: null,
    lastGrowthDate: null,
    daysWithoutGrowth: 0,
    engineVersion: GOIDANICH_ENGINE_VERSION,
  }
}

/**
 * Makes a state stored before cycles existed readable, so it can still be shown
 * until a replay replaces it, for example while offline.
 */
export function normalizeGoidanichCycleState(
  stored: GoidanichState & Partial<GoidanichCycleState>,
  resetFromDate: string,
): GoidanichCycleState {
  if (stored.status) return { ...initialGoidanichCycleState(), ...stored }
  return {
    ...initialGoidanichCycleState(),
    accumulatedPct: stored.accumulatedPct,
    alertLevel: stored.alertLevel,
    status: 'running',
    startDate: resetFromDate,
  }
}

/**
 * Only one cycle runs at a time: an infection event during a running cycle
 * doesn't start a second one, although each event is really its own infection.
 */
export function advanceGoidanichCycle(
  state: GoidanichCycleState,
  day: DayHours,
  options: GoidanichCycleOptions,
): { state: GoidanichCycleState; meanTempC: number; stepReason?: RiskReason } {
  const meanTempC = dailyMeanTemperature(day.hours)
  const starting = options.primaryEventDates.has(day.date) && state.status !== 'running'
  const current: GoidanichCycleState = starting
    ? { ...initialGoidanichCycleState(), status: 'running', startDate: day.date }
    : state
  if (current.status !== 'running') return { state: current, meanTempC }

  const step = advanceGoidanichState(current, {
    meanTempC,
    rhPct: dailyMeanHumidity(day.hours),
    wetTwoConsecutiveHours: hasConsecutiveWetHours(day.hours, 60, 2),
    requireWetHours: options.requireWetHours,
    incompleteDay: day.hours.length < GOIDANICH_MIN_HOURS_PER_DAY,
  })
  const lastGrowthDate = step.developmentAddedPct > 0 ? day.date : current.lastGrowthDate
  // Counted from dates, so days missing from the data still count as stagnation.
  const daysWithoutGrowth = daysBetween(lastGrowthDate ?? addDaysUTC(current.startDate ?? day.date, -1), day.date)

  let status: GoidanichCycleStatus = 'running'
  if (step.state.accumulatedPct >= URGENT_THRESHOLD_PCT) status = 'complete'
  else if (daysWithoutGrowth >= options.stallDays) status = 'stalled'

  return {
    state: {
      ...current,
      ...step.state,
      status,
      endDate: status === 'running' ? null : day.date,
      lastGrowthDate,
      daysWithoutGrowth,
    },
    meanTempC,
    stepReason: step.reason,
  }
}

/** A recorded harvest decides on its own; the profile's end date (MM-DD) applies only without one. */
export function secondarySeasonEnded(date: string, harvestDate: string | undefined, seasonEndMonthDay: string): boolean {
  return harvestDate !== undefined ? date > harvestDate : date.slice(5) > seasonEndMonthDay
}

export type GoidanichDayStatus =
  | { kind: 'none' }
  | { kind: 'seasonOver' }
  | { kind: 'complete'; endDate: string }
  | { kind: 'stalled'; endDate: string; days: number }

/** What to say about a day that has no percentage to show. */
export function goidanichDayStatus(
  state: GoidanichCycleState | undefined,
  date: string,
  seasonOver: boolean,
): GoidanichDayStatus {
  if (!state?.startDate || date < state.startDate) return { kind: 'none' }
  if (state.endDate && date >= state.endDate) {
    if (state.status === 'complete') return { kind: 'complete', endDate: state.endDate }
    if (state.status === 'stalled') return { kind: 'stalled', endDate: state.endDate, days: state.daysWithoutGrowth }
  }
  return state.status === 'running' && seasonOver ? { kind: 'seasonOver' } : { kind: 'none' }
}

/** The value to chart for a day: `null` unless a cycle is running or ended on that very day. */
export function goidanichDisplayPct(state: GoidanichCycleState, date: string): number | null {
  if (state.status === 'running') return state.accumulatedPct
  return state.status === 'complete' && state.endDate === date ? state.accumulatedPct : null
}
