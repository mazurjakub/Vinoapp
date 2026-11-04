/**
 * File: goidanichRegression.test.ts
 * Created: 2026-10-31
 * Description: Pins the exact Goidanich result of one cycle on fixed real weather data.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_GOIDANICH_THRESHOLDS } from './regionProfiles'
import type { HourlyWeather } from '../db/schema'
import fixture from './fixtures/goidanichVelkePavlovice2026.json'
import { advanceGoidanichCycle, initialGoidanichCycleState } from './goidanichCycle'
import { downyMildewPrimaryRisk } from './downyMildewPrimary'
import { REGION_PROFILES } from './regionProfiles'
import { groupByDay } from './weatherMath'

const hourly: HourlyWeather[] = fixture.time.map((time, i) => ({
  time,
  temperature2m: fixture.temperature2m[i],
  relativeHumidity2m: fixture.relativeHumidity2m[i],
  dewPoint2m: 0,
  precipitation: fixture.precipitation[i],
}))

const options = { primaryEventDates: new Set(['2026-09-30']), stallDays: 21, thresholds: DEFAULT_GOIDANICH_THRESHOLDS }

function runCycle() {
  let state = initialGoidanichCycleState()
  const pctByDate = new Map<string, number>()
  for (const day of groupByDay(hourly)) {
    state = advanceGoidanichCycle(state, day, options).state
    if (state.status === 'running' || state.endDate === day.date) pctByDate.set(day.date, state.accumulatedPct)
  }
  return { state, pctByDate }
}

describe('Goidanich cycle from 30 September on fixed Historical Forecast data', () => {
  it('gives the exact percentage and end date', () => {
    const { state } = runCycle()
    expect(state.status).toBe('complete')
    expect(state.endDate).toBe('2026-10-18')
    expect(state.lastGrowthDate).toBe('2026-10-18')
    expect(state.accumulatedPct).toBe(101.4)
  })

  it('gives the exact percentage on the days that decide the result', () => {
    const { pctByDate } = runCycle()
    expect(pctByDate.get('2026-09-30')).toBe(11.1)
    expect(pctByDate.get('2026-10-10')).toBe(90)
    expect(pctByDate.get('2026-10-11')).toBe(95)
    expect(pctByDate.get('2026-10-17')).toBe(95)
  })

  it('gives the same result when the data is run again', () => {
    expect(runCycle().state).toEqual(runCycle().state)
  })
})

describe('primary infection on the same data', () => {
  it('finds no event in the Morava profile, including 25 October with 4.5 mm at 6 °C', () => {
    const results = downyMildewPrimaryRisk(hourly, { budbreak: '2026-04-10' }, REGION_PROFILES['cz-morava'], 1000)
    const day = results.find((result) => result.date === '2026-10-25')
    expect(day?.risk).toBe('low')
    expect(results.filter((result) => result.risk === 'high').map((result) => result.date)).toEqual([])
  })
})
