/**
 * File: accumulatorSteps.ts
 * Created: 2026-10-03
 * Description: Single-day steps that advance the Goidanich and Gubler-Thomas season accumulators.
 */

import type { DayHours } from '../../rules'
import {
  advanceGoidanichCycle,
  advanceGublerThomasState,
  dayIsHot,
  dayQualifies,
  type GoidanichCycleOptions,
  type GoidanichCycleState,
  type GublerThomasState,
} from '../../rules'

/**
 * The single place where a day is folded into the Goidanich and
 * Gubler-Thomas indices. Both the persisted sync (`syncSeasonState.ts`) and
 * the in-memory projection for forecast days (`riskProjection.ts`) call these,
 * so the chart can never disagree with the stored values.
 */
export function makeGoidanichStep(options: GoidanichCycleOptions) {
  return (state: GoidanichCycleState, day: DayHours): GoidanichCycleState =>
    advanceGoidanichCycle(state, day, options).state
}

export function gublerStep(state: GublerThomasState, day: DayHours): GublerThomasState {
  return advanceGublerThomasState(state, dayQualifies(day.hours), dayIsHot(day.hours))
}
