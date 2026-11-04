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

/** Used by both the sync and the forecast projection, so the chart matches the stored values. */
export function makeGoidanichStep(options: GoidanichCycleOptions) {
  return (state: GoidanichCycleState, day: DayHours): GoidanichCycleState =>
    advanceGoidanichCycle(state, day, options).state
}

export function gublerStep(state: GublerThomasState, day: DayHours): GublerThomasState {
  return advanceGublerThomasState(state, dayQualifies(day.hours), dayIsHot(day.hours))
}
