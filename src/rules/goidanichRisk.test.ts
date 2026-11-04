/**
 * File: goidanichRisk.test.ts
 * Created: 2026-10-02
 * Description: Tests the incubation cycle and the secondary infection risk derived from it.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_GOIDANICH_THRESHOLDS } from './regionProfiles'
import {
  goidanichDayStatus,
  goidanichDisplayPct,
  initialGoidanichCycleState,
  normalizeGoidanichCycleState,
  secondarySeasonEnded,
} from './goidanichCycle'
import { goidanichSecondaryRisk } from './goidanichRisk'
import { makeDay } from '../test/testUtils'
import { addDaysUTC } from './weatherMath'

const START = '2026-06-01'

function days(count: number, temperature2m: number, relativeHumidity2m = 90, offset = 0) {
  return Array.from({ length: count }, (_, i) =>
    makeDay(addDaysUTC(START, i + offset), () => ({ temperature2m, relativeHumidity2m })),
  ).flat()
}

const options = { primaryEventDates: new Set([START]), stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS }

describe('goidanichSecondaryRisk', () => {
  it('only includes days from fromDate onward and starts at low risk', () => {
    const results = goidanichSecondaryRisk(days(2, 20, 50), addDaysUTC(START, 1), undefined, {
      primaryEventDates: new Set([addDaysUTC(START, 1)]),
      stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
    })
    expect(results).toHaveLength(1)
    expect(results[0].risk).toBe('low')
    expect(results[0].cycleStatus).toBe('running')
    expect(results[0].rule).toBe('downy-secondary-goidanich')
  })

  it('closes the cycle at 100% and stops reporting risk from it', () => {
    const results = goidanichSecondaryRisk(days(12, 25), START, undefined, options)
    const firstComplete = results.findIndex((r) => r.cycleStatus === 'complete')
    expect(firstComplete).toBeGreaterThan(0)
    expect(results[firstComplete].risk).toBe('low')
    expect(results[firstComplete].reasons[0].key).toBe('riskReasons.goidanichComplete')
    expect(results.slice(firstComplete).every((r) => r.cycleStatus === 'complete')).toBe(true)
  })

  it('reports high risk above 90% only while the cycle is developing', () => {
    const state = {
      ...initialGoidanichCycleState(),
      secondaryDetected: true,
      status: 'running' as const,
      startDate: START,
      accumulatedPct: 95,
      alertLevel: 'warning' as const,
    }
    const warm = goidanichSecondaryRisk(days(1, 13, 50), START, { ...state, accumulatedPct: 91 }, {
      primaryEventDates: new Set(),
      stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
    })
    const cold = goidanichSecondaryRisk(days(1, 5), START, state, { primaryEventDates: new Set(), stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS })
    expect(warm[0].risk).toBe('high')
    expect(cold[0].risk).toBe('low')
    expect(cold[0].reasons[0].params?.pct).toBe('95')
  })

  it('ends a cycle that stops developing for the configured number of days', () => {
    const results = goidanichSecondaryRisk(days(6, 5), START, undefined, options)
    expect(results[3].cycleStatus).toBe('running')
    expect(results[4].cycleStatus).toBe('stalled')
    expect(results[5].risk).toBe('low')
  })

  it('starts a new cycle at the next infection event after the previous one ended', () => {
    const newEvent = addDaysUTC(START, 8)
    const results = goidanichSecondaryRisk(days(10, 5), START, undefined, {
      primaryEventDates: new Set([START, newEvent]),
      stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
    })
    const atEvent = results.find((r) => r.date === newEvent)
    expect(atEvent?.cycleStatus).toBe('running')
    expect(atEvent?.reasons[0].dates?.start).toBe(newEvent)
  })

  it('does not start a second cycle during a running one', () => {
    const second = addDaysUTC(START, 1)
    const results = goidanichSecondaryRisk(days(3, 20, 50), START, undefined, {
      primaryEventDates: new Set([START, second]),
      stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
    })
    expect(results[2].reasons[0].dates?.start).toBe(START)
  })

  it('reports high risk on a day with a possible new infection, even without a running cycle', () => {
    const results = goidanichSecondaryRisk(days(1, 5), START, undefined, {
      primaryEventDates: new Set(),
      stallDays: 5, thresholds: DEFAULT_GOIDANICH_THRESHOLDS,
      newInfectionDates: new Set([START]),
    })
    expect(results[0].cycleStatus).toBe('none')
    expect(results[0].risk).toBe('high')
  })
})

describe('goidanichSecondaryRisk - start and increase', () => {
  it('a cold first day does not block the start of the cycle', () => {
    const hourly = [...days(1, 5), ...days(1, 20, 50, 1)]
    const results = goidanichSecondaryRisk(hourly, START, undefined, options)
    expect(results[0].cycleStatus).toBe('running')
    expect(results[0].reasons[0].params?.pct).toBe('0')
    expect(results[0].reasons[1].key).toBe('riskReasons.goidanichTooCold')
    expect(Number(results[1].reasons[0].params?.pct)).toBeGreaterThan(0)
  })

  it('a day above 12 °C without rain adds development', () => {
    const hourly = days(1, 20, 50).map((h) => ({ ...h, precipitation: 0 }))
    const results = goidanichSecondaryRisk(hourly, START, undefined, options)
    expect(Number(results[0].reasons[0].params?.pct)).toBeGreaterThan(0)
  })

  it('requires the two-hour humidity condition only when asked to', () => {
    const dryHours = days(1, 20, 50)
    const gated = goidanichSecondaryRisk(dryHours, START, undefined, { ...options, requireWetHours: true })
    expect(gated[0].reasons[0].params?.pct).toBe('0')
    expect(gated[0].reasons[1].key).toBe('riskReasons.goidanichNoWetHours')
  })
})

describe('goidanichSecondaryRisk - stagnation', () => {
  const at95 = {
    ...initialGoidanichCycleState(),
    status: 'running' as const,
    startDate: '2026-05-01',
    lastGrowthDate: addDaysUTC(START, -1),
    accumulatedPct: 95,
    alertLevel: 'warning' as const,
  }
  const noEvents = { primaryEventDates: new Set<string>(), stallDays: 21, thresholds: DEFAULT_GOIDANICH_THRESHOLDS }

  it('closes a cycle stuck at 95% after 21 days without growth', () => {
    const results = goidanichSecondaryRisk(days(22, 5), START, at95, noEvents)
    expect(results[19].cycleStatus).toBe('running')
    expect(results[20].cycleStatus).toBe('stalled')
    expect(results[20].reasons[0].dates?.end).toBe(addDaysUTC(START, 20))
  })

  it('counts from the real last growth, including days missing from the data', () => {
    const afterGap = days(1, 5, 90, 20)
    const results = goidanichSecondaryRisk(afterGap, START, at95, noEvents)
    expect(results[0].cycleStatus).toBe('stalled')
  })

  it('restarts the count after growth', () => {
    const hourly = [...days(10, 5), ...days(1, 13, 50, 10), ...days(15, 5, 90, 11)]
    const results = goidanichSecondaryRisk(hourly, START, { ...at95, accumulatedPct: 50 }, noEvents)
    expect(results[25].cycleStatus).toBe('running')
  })
})

describe('normalizeGoidanichCycleState', () => {
  it('keeps the value of a state stored before cycles existed', () => {
    const state = normalizeGoidanichCycleState({ accumulatedPct: 95, alertLevel: 'warning' }, START)
    expect(state).toMatchObject({ accumulatedPct: 95, status: 'running', startDate: START })
  })
})

describe('goidanichDisplayPct', () => {
  const base = { ...initialGoidanichCycleState(), accumulatedPct: 104, endDate: START }

  it('keeps the value on the closing day, then hides it', () => {
    expect(goidanichDisplayPct({ ...base, status: 'complete' }, START)).toBe(104)
    expect(goidanichDisplayPct({ ...base, status: 'complete' }, addDaysUTC(START, 1))).toBeNull()
  })

  it('hides a stalled cycle', () => {
    expect(goidanichDisplayPct({ ...base, status: 'stalled' }, START)).toBeNull()
  })
})

describe('goidanichDayStatus', () => {
  const ended = { ...initialGoidanichCycleState(), startDate: '2026-09-30', endDate: '2026-10-18', daysWithoutGrowth: 21 }

  it('names how a cycle ended, from its end date on', () => {
    expect(goidanichDayStatus({ ...ended, status: 'complete' }, '2026-10-19', false)).toEqual({ kind: 'complete', endDate: '2026-10-18' })
    expect(goidanichDayStatus({ ...ended, status: 'stalled' }, '2026-10-18', false)).toEqual({ kind: 'stalled', endDate: '2026-10-18', days: 21 })
  })

  it('reports no cycle before the first one started, or when there is none', () => {
    expect(goidanichDayStatus({ ...ended, status: 'complete' }, '2026-09-29', false)).toEqual({ kind: 'none' })
    expect(goidanichDayStatus(undefined, '2026-10-19', false)).toEqual({ kind: 'none' })
    expect(goidanichDayStatus(initialGoidanichCycleState(), '2026-10-19', false)).toEqual({ kind: 'none' })
  })

  it('tells apart a running cycle cut off by the end of the season', () => {
    const running = { ...ended, status: 'running' as const, endDate: null }
    expect(goidanichDayStatus(running, '2026-11-01', true)).toEqual({ kind: 'seasonOver' })
  })
})

describe('incomplete days', () => {
  it('adds nothing on a day with too few hours, and counts it towards stagnation', () => {
    const hourly = makeDay(START, () => ({ temperature2m: 20, relativeHumidity2m: 50 })).slice(0, 17)
    const results = goidanichSecondaryRisk(hourly, START, undefined, options)
    expect(results[0].reasons[0].params?.pct).toBe('0')
    expect(results[0].reasons[1].key).toBe('riskReasons.goidanichIncompleteDay')
  })
})

describe('secondarySeasonEnded', () => {
  it('ends after the harvest, or after the end date without a harvest', () => {
    expect(secondarySeasonEnded('2026-09-11', '2026-09-10', '10-31')).toBe(true)
    expect(secondarySeasonEnded('2026-09-10', '2026-09-10', '10-31')).toBe(false)
    expect(secondarySeasonEnded('2026-11-01', '2026-11-05', '10-31')).toBe(false)
    expect(secondarySeasonEnded('2026-10-31', undefined, '10-31')).toBe(false)
    expect(secondarySeasonEnded('2026-11-01', undefined, '10-31')).toBe(true)
  })
})
