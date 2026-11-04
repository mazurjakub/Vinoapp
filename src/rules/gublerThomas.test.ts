/**
 * File: gublerThomas.test.ts
 * Created: 2026-10-03
 * Description: Tests the Gubler-Thomas index, including ignition, limits and hot days.
 */

import { describe, expect, it } from 'vitest'
import {
  advanceGublerThomasState,
  dayIsHot,
  GUBLER_THOMAS,
  initialGublerThomasState,
  powderyMildewGublerThomasRisk,
  resolveGublerStart,
  type GublerThomasState,
} from './gublerThomas'
import { makeDay } from '../test/testUtils'
import type { HourlyWeather } from '../db/schema'

function qualifyingDay(date: string): HourlyWeather[] {
  // 8 consecutive hours at 25 °C (>= the 6h minimum), rest cold.
  return makeDay(date, (hour) => ({ temperature2m: hour >= 10 && hour < 18 ? 25 : 5 }))
}

function nonQualifyingDay(date: string): HourlyWeather[] {
  return makeDay(date, () => ({ temperature2m: 15 }))
}

describe('advanceGublerThomasState - ignition', () => {
  it('stays at score 0 before 3 consecutive qualifying days', () => {
    let state = initialGublerThomasState()
    state = advanceGublerThomasState(state, true)
    expect(state.score).toBe(0)
    expect(state.ignited).toBe(false)
    state = advanceGublerThomasState(state, true)
    expect(state.score).toBe(0)
    expect(state.ignited).toBe(false)
  })

  it('resets the streak on a non-qualifying day before ignition', () => {
    let state = initialGublerThomasState()
    state = advanceGublerThomasState(state, true)
    state = advanceGublerThomasState(state, false)
    expect(state.consecutiveQualifyingDays).toBe(0)
    expect(state.ignited).toBe(false)
  })

  it('ignites on the 3rd consecutive qualifying day', () => {
    let state = initialGublerThomasState()
    state = advanceGublerThomasState(state, true)
    state = advanceGublerThomasState(state, true)
    state = advanceGublerThomasState(state, true)
    expect(state.ignited).toBe(true)
    expect(state.score).toBe(60)
  })
})

describe('advanceGublerThomasState - stepping after ignition', () => {
  const ignited: GublerThomasState = { score: 60, consecutiveQualifyingDays: 3, ignited: true }

  it('adds 20 points for a qualifying day', () => {
    const next = advanceGublerThomasState(ignited, true)
    expect(next.score).toBe(80)
  })

  it('subtracts 10 points for a non-qualifying day', () => {
    const next = advanceGublerThomasState(ignited, false)
    expect(next.score).toBe(50)
  })

  it('clamps the score at 100', () => {
    const near100: GublerThomasState = { score: 95, consecutiveQualifyingDays: 5, ignited: true }
    expect(advanceGublerThomasState(near100, true).score).toBe(100)
  })

  it('clamps the score at 0', () => {
    const near0: GublerThomasState = { score: 5, consecutiveQualifyingDays: 0, ignited: true }
    expect(advanceGublerThomasState(near0, false).score).toBe(0)
  })

  it('stays ignited even if the score drops back to 0', () => {
    const near0: GublerThomasState = { score: 0, consecutiveQualifyingDays: 0, ignited: true }
    const next = advanceGublerThomasState(near0, false)
    expect(next.ignited).toBe(true)
    expect(next.score).toBe(0)
  })
})

describe('advanceGublerThomasState - hot-day rule', () => {
  const ignited: GublerThomasState = { score: 60, consecutiveQualifyingDays: 3, ignited: true }

  it('qualifying, not hot: +20', () => {
    expect(advanceGublerThomasState(ignited, true, false).score).toBe(80)
  })

  it('non-qualifying, not hot: -10', () => {
    expect(advanceGublerThomasState(ignited, false, false).score).toBe(50)
  })

  it('qualifying and hot nets +10 (not +20-10 as two separate uncapped moves)', () => {
    expect(advanceGublerThomasState(ignited, true, true).score).toBe(70)
  })

  it('non-qualifying and hot stays -10, not -20 (clamped)', () => {
    expect(advanceGublerThomasState(ignited, false, true).score).toBe(50)
  })

  it('clamps at the 100 ceiling even on a qualifying+hot day', () => {
    const near100: GublerThomasState = { score: 95, consecutiveQualifyingDays: 5, ignited: true }
    expect(advanceGublerThomasState(near100, true, true).score).toBe(100)
  })

  it('clamps at the 0 floor', () => {
    const near0: GublerThomasState = { score: 5, consecutiveQualifyingDays: 0, ignited: true }
    expect(advanceGublerThomasState(near0, false, true).score).toBe(0)
  })

  it('a hot day in the middle of the pre-ignition streak still counts toward ignition', () => {
    let state = initialGublerThomasState()
    state = advanceGublerThomasState(state, true, false)
    state = advanceGublerThomasState(state, true, true) // hot, but still qualifying
    state = advanceGublerThomasState(state, true, false)
    expect(state.ignited).toBe(true)
    expect(state.consecutiveQualifyingDays).toBe(3)
  })

  it('dayIsHot: true when any hour reaches the threshold', () => {
    const hours = makeDay('2026-07-01', (hour) => ({ temperature2m: hour === 14 ? 35 : 20 }))
    expect(dayIsHot(hours)).toBe(true)
  })

  it('dayIsHot: false when no hour reaches the threshold', () => {
    const hours = makeDay('2026-07-01', () => ({ temperature2m: 30 }))
    expect(dayIsHot(hours)).toBe(false)
  })
})

describe('resolveGublerStart', () => {
  it('starts from the season start without a spray in this season', () => {
    expect(resolveGublerStart('2026-04-01', undefined).resetFromDate).toBe('2026-04-01')
    expect(resolveGublerStart('2026-04-01', '2025-08-01').initialState).toEqual(initialGublerThomasState())
  })

  it('sets the index to zero the day after a spray, keeping it started', () => {
    const start = resolveGublerStart('2026-04-01', '2026-07-10')
    expect(start.resetFromDate).toBe('2026-07-11')
    expect(start.initialState).toEqual({ score: 0, consecutiveQualifyingDays: 0, ignited: true })
    expect(advanceGublerThomasState(start.initialState, true).score).toBe(20)
  })
})

describe('powderyMildewGublerThomasRisk', () => {
  it('reports low risk for days before ignition', () => {
    const hourly = [...qualifyingDay('2026-07-01'), ...qualifyingDay('2026-07-02')]
    const results = powderyMildewGublerThomasRisk(hourly)
    expect(results.every((r) => r.risk === 'low')).toBe(true)
    expect(results[0].reasons.some((r) => r.key === 'riskReasons.gublerNotIgnited')).toBe(true)
  })

  it('reports high risk immediately on the ignition day (boundary: score 60)', () => {
    const hourly = [
      ...qualifyingDay('2026-07-01'),
      ...qualifyingDay('2026-07-02'),
      ...qualifyingDay('2026-07-03'),
    ]
    const results = powderyMildewGublerThomasRisk(hourly)
    expect(results[2].risk).toBe('high')
    expect(results[2].reasons).toContainEqual({ key: 'riskReasons.gublerScore', params: { score: 60 } })
  })

  it('always labels the result as an indicative Californian model', () => {
    const hourly = qualifyingDay('2026-07-01')
    const results = powderyMildewGublerThomasRisk(hourly)
    expect(results[0].reasons).toContainEqual({ key: 'riskReasons.gublerIndicative' })
    expect(results[0].source).toMatch(/Californian/)
  })

  it('reports medium risk after the score drops into the 31-50 gap-filled band', () => {
    const hourly = [
      ...qualifyingDay('2026-07-01'),
      ...qualifyingDay('2026-07-02'),
      ...qualifyingDay('2026-07-03'), // ignite at 60
      ...nonQualifyingDay('2026-07-04'), // 50
      ...nonQualifyingDay('2026-07-05'), // 40
    ]
    const results = powderyMildewGublerThomasRisk(hourly)
    expect(results[3].risk).toBe('medium') // score 50
    expect(results[4].risk).toBe('medium') // score 40
  })

  it('recovers to low risk after enough non-qualifying days', () => {
    const hourly = [
      ...qualifyingDay('2026-07-01'),
      ...qualifyingDay('2026-07-02'),
      ...qualifyingDay('2026-07-03'), // 60
      ...nonQualifyingDay('2026-07-04'), // 50
      ...nonQualifyingDay('2026-07-05'), // 40
      ...nonQualifyingDay('2026-07-06'), // 30
    ]
    const results = powderyMildewGublerThomasRisk(hourly)
    expect(results[5].risk).toBe('low')
  })
})

describe('GUBLER_THOMAS constants', () => {
  it('match the published thresholds', () => {
    expect(GUBLER_THOMAS.MIN_TEMPERATURE_C).toBe(21)
    expect(GUBLER_THOMAS.MAX_TEMPERATURE_C).toBe(30)
    expect(GUBLER_THOMAS.MIN_CONSECUTIVE_HOURS).toBe(6)
    expect(GUBLER_THOMAS.DAILY_GAIN).toBe(20)
    expect(GUBLER_THOMAS.DAILY_LOSS).toBe(-10)
    expect(GUBLER_THOMAS.IGNITION_CONSECUTIVE_DAYS).toBe(3)
  })
})
