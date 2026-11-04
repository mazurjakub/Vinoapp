/**
 * File: gublerThomas.ts
 * Created: 2026-10-20
 * Description: Gubler-Thomas powdery mildew risk index.
 */

import type { HourlyWeather } from '../db/schema'
import type { Risk, RiskReason, RiskResult } from './types'
import { addDaysUTC, groupByDay, longestConsecutiveRun } from './weatherMath'

/**
 * A Californian model that assumes a confirmed first infection, so every day's
 * reasons label it as indicative only for Moravia.
 */
export const GUBLER_THOMAS = {
  MIN_TEMPERATURE_C: 21,
  MAX_TEMPERATURE_C: 30,
  MIN_CONSECUTIVE_HOURS: 6,
  DAILY_GAIN: 20,
  DAILY_LOSS: -10,
  MIN_SCORE: 0,
  MAX_SCORE: 100,
  IGNITION_CONSECUTIVE_DAYS: 3,
  /**
   * The rule is ≥35 °C for more than 15 minutes. Open-Meteo only has hourly
   * data, so this is approximated as at least one hour at this temperature,
   * which hasn't been checked against sub-hourly station data.
   */
  HOT_TEMPERATURE_C: 35,
  HOT_DAY_LOSS: -10,
  /** Per-day delta (before clamping the running score to 0-100) stays within this range. */
  MIN_DAILY_DELTA: -10,
  MAX_DAILY_DELTA: 20,
} as const

const SOURCE =
  'UC Davis Powdery Mildew Risk Index (APS, UC IPM). Californian model, ' +
  'an indicative and unverified estimate for Moravia.'

export interface GublerThomasState {
  score: number
  consecutiveQualifyingDays: number
  ignited: boolean
}

export function initialGublerThomasState(): GublerThomasState {
  return { score: 0, consecutiveQualifyingDays: 0, ignited: false }
}

/**
 * The published bands are 0–30 low, 40–50 medium and 60–100 high. The undefined
 * gaps (31–39 and 51–59) go to the next higher band to err on the cautious side;
 * that choice isn't from the source.
 */
export function scoreToRisk(score: number): Risk {
  if (score <= 30) return 'low'
  if (score <= 50) return 'medium'
  return 'high'
}

/**
 * Per UC IPM, a treatment sets the index to zero. It stays started, so it then
 * follows the normal daily steps instead of waiting for a new 3-day streak.
 */
export function resolveGublerStart(
  seasonStart: string,
  latestSprayDate: string | undefined,
): { resetFromDate: string; initialState: GublerThomasState } {
  if (latestSprayDate === undefined || latestSprayDate < seasonStart) {
    return { resetFromDate: seasonStart, initialState: initialGublerThomasState() }
  }
  return {
    resetFromDate: addDaysUTC(latestSprayDate, 1),
    initialState: { score: 0, consecutiveQualifyingDays: 0, ignited: true },
  }
}

const inTemperatureWindow = (h: HourlyWeather) =>
  h.temperature2m >= GUBLER_THOMAS.MIN_TEMPERATURE_C && h.temperature2m <= GUBLER_THOMAS.MAX_TEMPERATURE_C

export function dayQualifies(hours: HourlyWeather[]): boolean {
  return longestConsecutiveRun(hours, inTemperatureWindow) >= GUBLER_THOMAS.MIN_CONSECUTIVE_HOURS
}

export function dayIsHot(hours: HourlyWeather[]): boolean {
  return hours.some((h) => h.temperature2m >= GUBLER_THOMAS.HOT_TEMPERATURE_C)
}

/**
 * On the ignition day the score starts at the gain of all streak days (60 for
 * 3 days). The sources don't give a starting score, so this is the app's choice.
 *
 * A hot day still counts toward the ignition streak: per UC IPM, a qualifying
 * hot day nets +10 rather than losing its qualification.
 */
export function advanceGublerThomasState(
  state: GublerThomasState,
  qualifies: boolean,
  isHot = false,
): GublerThomasState {
  if (!state.ignited) {
    if (!qualifies) {
      return { score: 0, consecutiveQualifyingDays: 0, ignited: false }
    }
    const consecutiveQualifyingDays = state.consecutiveQualifyingDays + 1
    if (consecutiveQualifyingDays >= GUBLER_THOMAS.IGNITION_CONSECUTIVE_DAYS) {
      const score = Math.min(GUBLER_THOMAS.MAX_SCORE, consecutiveQualifyingDays * GUBLER_THOMAS.DAILY_GAIN)
      return { score, consecutiveQualifyingDays, ignited: true }
    }
    return { score: 0, consecutiveQualifyingDays, ignited: false }
  }

  const rawDelta = (qualifies ? GUBLER_THOMAS.DAILY_GAIN : GUBLER_THOMAS.DAILY_LOSS) +
    (isHot ? GUBLER_THOMAS.HOT_DAY_LOSS : 0)
  const delta = Math.min(GUBLER_THOMAS.MAX_DAILY_DELTA, Math.max(GUBLER_THOMAS.MIN_DAILY_DELTA, rawDelta))
  const score = Math.min(GUBLER_THOMAS.MAX_SCORE, Math.max(GUBLER_THOMAS.MIN_SCORE, state.score + delta))
  const consecutiveQualifyingDays = qualifies ? state.consecutiveQualifyingDays + 1 : 0
  return { score, consecutiveQualifyingDays, ignited: true }
}

/** `startingState` continues from a stored state instead of starting at zero. */
export function powderyMildewGublerThomasRisk(
  hourly: HourlyWeather[],
  startingState: GublerThomasState = initialGublerThomasState(),
): RiskResult[] {
  let state = startingState

  return groupByDay(hourly).map((day) => {
    const qualifies = dayQualifies(day.hours)
    const isHot = dayIsHot(day.hours)
    state = advanceGublerThomasState(state, qualifies, isHot)
    const risk = scoreToRisk(state.score)

    const reasons: RiskReason[] = [
      qualifies
        ? {
            key: 'riskReasons.gublerQualified',
            params: {
              min: GUBLER_THOMAS.MIN_TEMPERATURE_C,
              max: GUBLER_THOMAS.MAX_TEMPERATURE_C,
              hours: GUBLER_THOMAS.MIN_CONSECUTIVE_HOURS,
            },
          }
        : { key: 'riskReasons.gublerNotQualified' },
      ...(isHot ? [{ key: 'riskReasons.gublerHotDay', params: { temperature: GUBLER_THOMAS.HOT_TEMPERATURE_C } }] : []),
      state.ignited
        ? { key: 'riskReasons.gublerScore', params: { score: state.score } }
        : {
            key: 'riskReasons.gublerNotIgnited',
            params: {
              current: state.consecutiveQualifyingDays,
              required: GUBLER_THOMAS.IGNITION_CONSECUTIVE_DAYS,
            },
          },
      { key: 'riskReasons.gublerIndicative' },
    ]

    return { date: day.date, risk, reasons, rule: 'powdery-gubler-thomas', source: SOURCE }
  })
}
