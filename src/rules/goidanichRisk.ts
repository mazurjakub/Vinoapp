/**
 * File: goidanichRisk.ts
 * Created: 2026-10-02
 * Description: Derives daily secondary downy mildew risk from the incubation cycle and new infections.
 */

import type { HourlyWeather } from '../db/schema'
import {
  advanceGoidanichCycle,
  initialGoidanichCycleState,
  type GoidanichCycleOptions,
  type GoidanichCycleState,
  type GoidanichCycleStatus,
} from './goidanichCycle'
import { GOIDANICH_TABLE_MIN_TEMP_C } from './goidanichDailyDevelopment'
import type { RiskReason, RiskResult } from './types'
import { groupByDay } from './weatherMath'

const SOURCE =
  'Goidanich table and algorithm from Pérez-Expósito et al. (2017), VineSens. ' +
  'Unverified model; the table transcription contains uncertain cells.'

export interface GoidanichDayResult extends RiskResult {
  cycleStatus: GoidanichCycleStatus
}

function statusReason(state: GoidanichCycleState): RiskReason {
  const start = state.startDate ?? ''
  const end = state.endDate ?? ''
  if (state.status === 'running') {
    return {
      key: 'riskReasons.goidanichRunning',
      dates: { start },
      params: { pct: state.accumulatedPct.toFixed(0) },
    }
  }
  if (state.status === 'complete') return { key: 'riskReasons.goidanichComplete', dates: { start, end } }
  if (state.status === 'stalled') return { key: 'riskReasons.goidanichStalled', dates: { start, end } }
  return { key: 'riskReasons.goidanichNoCycle' }
}

/**
 * Risk is high only when a cycle above the warning threshold is still developing
 * today, or when a new infection is possible today.
 */
export function goidanichSecondaryRisk(
  hourly: HourlyWeather[],
  fromDate: string,
  initialState: GoidanichCycleState | undefined,
  options: GoidanichCycleOptions & { newInfectionDates?: ReadonlySet<string> },
): GoidanichDayResult[] {
  const allDays = groupByDay(hourly)
  let state = initialState ?? initialGoidanichCycleState()
  const results: GoidanichDayResult[] = []

  allDays.forEach((day) => {
    if (day.date < fromDate) return
    const step = advanceGoidanichCycle(state, day, options)
    state = step.state

    const nearEnd =
      state.status === 'running' &&
      state.accumulatedPct >= options.thresholds.warning &&
      step.meanTempC >= GOIDANICH_TABLE_MIN_TEMP_C
    const newInfection = options.newInfectionDates?.has(day.date) ?? false

    results.push({
      date: day.date,
      risk: nearEnd || newInfection ? 'high' : 'low',
      reasons: [
        statusReason(state),
        ...(nearEnd ? [{ key: 'riskReasons.goidanichNearEnd', params: { threshold: options.thresholds.warning } }] : []),
        ...(newInfection ? [{ key: 'riskReasons.goidanichNewInfection' }] : []),
        ...(state.status === 'running' && step.stepReason ? [step.stepReason] : []),
      ],
      rule: 'downy-secondary-goidanich',
      source: SOURCE,
      cycleStatus: state.status,
    })
  })
  return results
}
