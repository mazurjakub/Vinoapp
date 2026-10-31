/**
 * File: riskProjection.test.ts
 * Created: 2026-10-03
 * Description: Tests the index projection for today and forecast days.
 */

import { describe, expect, it } from 'vitest'
import type { HourlyWeather } from '../../db/schema'
import {
  addDaysUTC,
  goidanichDisplayPct,
  groupByDay,
  initialGoidanichCycleState,
  initialGublerThomasState,
  type DayHours,
  type GoidanichCycleState,
  type GublerThomasState,
} from '../../rules'
import { foldDays, type DailyAccumulatorRecord } from './dailyAccumulator'
import { gublerStep, makeGoidanichStep } from './accumulatorSteps'
import { projectGoidanichPct, projectGublerScore } from './riskProjection'

const START = '2026-04-01'

function day(i: number): DayHours[] {
  const date = addDaysUTC(START, i)
  const temp = 15 + 10 * Math.sin(i / 3)
  const rh = 50 + 30 * Math.cos(i / 4)
  // Runs of 4 wet days in a row, so the two-day rain gate actually opens and the test exercises accumulation.
  const precip = i % 7 < 4 ? 12 : 0
  const hours: HourlyWeather[] = Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature2m: temp,
    relativeHumidity2m: rh,
    dewPoint2m: 0,
    precipitation: hour === 0 ? precip : 0,
  }))
  return groupByDay(hours)
}

const ALL_DAYS = Array.from({ length: 30 }, (_, i) => day(i)).flat()
const CYCLE_OPTIONS = { primaryEventDates: new Set([START]), stallDays: 21 }
const goidanichStep = makeGoidanichStep(CYCLE_OPTIONS)

describe('projection equals continuous computation', () => {
  it('Goidanich: stored state at day k + projection of k+1..n equals one continuous run', () => {
    const resetFromDate = START
    const continuousPct = new Map<string, number | null>()
    foldDays<GoidanichCycleState>({
      resetFromDate,
      start: { state: initialGoidanichCycleState(), lastProcessedDate: '', resetFromDate },
      days: ALL_DAYS,
      step: goidanichStep,
      onDay: (d, state) => continuousPct.set(d.date, goidanichDisplayPct(state, d.date)),
    })

    const k = 12 // "stored" up to here; the rest is only in memory
    const storedDays = ALL_DAYS.filter((d) => d.date <= addDaysUTC(START, k))
    const stored: DailyAccumulatorRecord<GoidanichCycleState> = foldDays<GoidanichCycleState>({
      resetFromDate,
      start: { state: initialGoidanichCycleState(), lastProcessedDate: '', resetFromDate },
      days: storedDays,
      step: goidanichStep,
    })

    const projected = projectGoidanichPct(stored, resetFromDate, ALL_DAYS, CYCLE_OPTIONS)
    for (let i = k + 1; i < 30; i++) {
      const date = addDaysUTC(START, i)
      expect(projected.get(date) ?? null).toBe(continuousPct.get(date) ?? null)
    }
    expect([...continuousPct.values()].some((pct) => pct !== null)).toBe(true)
    // The stored days themselves are not re-emitted by the projection.
    expect(projected.has(addDaysUTC(START, 3))).toBe(false)
  })

  it('Gubler-Thomas: projection ends on the same score as continuous computation', () => {
    const continuous = foldDays<GublerThomasState>({
      resetFromDate: START,
      start: { state: initialGublerThomasState(), lastProcessedDate: '', resetFromDate: START },
      days: ALL_DAYS,
      step: gublerStep,
    })
    const stored = foldDays<GublerThomasState>({
      resetFromDate: START,
      start: { state: initialGublerThomasState(), lastProcessedDate: '', resetFromDate: START },
      days: ALL_DAYS.filter((d) => d.date <= addDaysUTC(START, 9)),
      step: gublerStep,
    })
    const scores = projectGublerScore(stored, START, ALL_DAYS)
    expect(scores.get(addDaysUTC(START, 29))).toBe(continuous.state.ignited ? continuous.state.score : null)
  })

  it('Gubler-Thomas: null before ignition, never 0', () => {
    const early = ALL_DAYS.filter((d) => d.date <= addDaysUTC(START, 1))
    const scores = projectGublerScore(undefined, START, early)
    for (const value of scores.values()) expect(value).toBeNull()
  })

  it('Goidanich: no entries at all when there is nothing to fold from the reset date', () => {
    const pct = projectGoidanichPct(undefined, '2030-01-01', ALL_DAYS, CYCLE_OPTIONS)
    expect(pct.size).toBe(0)
  })

  it('Goidanich: no entries after the season is over', () => {
    const lastDay = addDaysUTC(START, 2)
    const pct = projectGoidanichPct(undefined, START, ALL_DAYS, CYCLE_OPTIONS, (date) => date > lastDay)
    expect(pct.has(addDaysUTC(START, 3))).toBe(false)
  })
})
