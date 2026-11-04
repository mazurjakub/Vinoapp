/**
 * File: goidanichOutlook.test.ts
 * Created: 2026-11-03
 * Description: Tests the Goidanich daily increments and the estimate of when the index reaches its thresholds.
 */

import { describe, expect, it } from 'vitest'
import { addDaysUTC } from '../../rules'
import { firstOffSeasonDate, goidanichIncrements, goidanichOutlook, recentlyCold, type GoidanichDay } from './goidanichOutlook'

const TODAY = '2026-07-10'
const THRESHOLDS = { alert: 90, urgent: 100 }
const inSeason = () => false

/** Days from `TODAY + firstOffset`, one per value. */
function series(firstOffset: number, pcts: (number | null)[], meanTempC = 18): GoidanichDay[] {
  return pcts.map((pct, i) => ({ date: addDaysUTC(TODAY, firstOffset + i), pct, meanTempC }))
}

describe('goidanichIncrements', () => {
  it('is the difference from the previous day, and the full value on a cycle start', () => {
    const result = goidanichIncrements(series(-3, [null, 6, 13.5, 13.5]), 12)
    expect(result.map((r) => r.incrementPct)).toEqual([null, 6, 7.5, 0])
  })

  it('starts again from 0 after a fall (a new cycle)', () => {
    const result = goidanichIncrements(series(-2, [100, 4, 9]), 12)
    expect(result.map((r) => r.incrementPct)).toEqual([null, 4, 5])
  })

  it('marks a day without growth as cold only below the minimum temperature', () => {
    const days: GoidanichDay[] = [
      { date: '2026-07-01', pct: 20, meanTempC: 15 },
      { date: '2026-07-02', pct: 20, meanTempC: 11.9 },
      { date: '2026-07-03', pct: 20, meanTempC: 12 },
      { date: '2026-07-04', pct: 24, meanTempC: 11 },
    ]
    expect(goidanichIncrements(days, 12).map((r) => r.cold)).toEqual([false, true, false, false])
  })

  it('has no increment and no cold mark on a day without a value', () => {
    expect(goidanichIncrements(series(0, [10, null], 5), 12)[1]).toEqual({ date: addDaysUTC(TODAY, 1), incrementPct: null, cold: false })
  })
})

describe('goidanichOutlook', () => {
  it('estimates both thresholds from the forecast', () => {
    const days = series(-2, [60, 70, 80, 88, 95, 102])
    expect(goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toMatchObject({
      kind: 'cycle',
      alert: { status: 'estimated', date: addDaysUTC(TODAY, 2) },
      urgent: { status: 'estimated', date: addDaysUTC(TODAY, 3) },
    })
  })

  it('says a threshold is not reached within the forecast', () => {
    const days = series(-2, [40, 45, 50, 52, 55])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({ kind: 'cycle', alert: { status: 'notReached' }, urgent: { status: 'notReached' } })
  })

  it('gives both thresholds the same day when the index jumps over them', () => {
    const days = series(-1, [80, 85, 88, 103])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({
      kind: 'cycle',
      alert: { status: 'estimated', date: addDaysUTC(TODAY, 2) },
      urgent: { status: 'estimated', date: addDaysUTC(TODAY, 2) },
    })
  })

  it('reports a threshold crossed before today as reached', () => {
    const days = series(-3, [85, 92, 95, 97, 99])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({
      kind: 'cycle',
      alert: { status: 'reached', date: addDaysUTC(TODAY, -2) },
      urgent: { status: 'notReached' },
    })
  })

  it('keeps a cycle that reached 100% yesterday and has no value today', () => {
    const days = series(-2, [95, 100, null, null])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({ kind: 'cycle', urgent: { status: 'reached', date: addDaysUTC(TODAY, -1) } })
  })

  it('ignores the cycle before a spray restart', () => {
    // 95% before the spray, a gap, then a new cycle from a new primary event.
    const days = series(-5, [92, 95, null, 5, 12, 20, 30])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({ kind: 'cycle', alert: { status: 'notReached' }, urgent: { status: 'notReached' } })
  })

  it('treats a new cycle right after a finished one as its own', () => {
    const days = series(-2, [100, 6, 14, 60, 100])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({ kind: 'cycle', urgent: { status: 'estimated', date: addDaysUTC(TODAY, 2) } })
  })

  it('estimates nothing after the season end', () => {
    const days = series(-2, [80, 95, null, null])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: (d) => d >= TODAY })
    expect(outlook).toEqual({ kind: 'seasonOver' })
  })

  it('does not reach a threshold that only the off-season days would pass', () => {
    // The season ends tomorrow, so the projection has no values from then on.
    const days = series(-1, [70, 80, null, null])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: (d) => d > TODAY })
    expect(outlook).toMatchObject({ kind: 'cycle', alert: { status: 'notReached' }, urgent: { status: 'notReached' } })
  })

  it('has nothing to say without a running cycle', () => {
    expect(goidanichOutlook({ days: series(-1, [null, null, null]), today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toEqual({ kind: 'none' })
    // A cycle that stalled at 40% before today.
    expect(goidanichOutlook({ days: series(-2, [40, null, null]), today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toEqual({ kind: 'none' })
  })
})

describe('cold in the outlook', () => {
  it('says so when the last days up to today added nothing in the cold', () => {
    const days = series(-3, [40, 50, 50, 50, 50], 8)
    expect(goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toMatchObject({ kind: 'cycle', cold: true })
  })

  it('does not say so when the index still grew yesterday', () => {
    const days: GoidanichDay[] = [
      { date: addDaysUTC(TODAY, -2), pct: 40, meanTempC: 18 },
      { date: addDaysUTC(TODAY, -1), pct: 48, meanTempC: 18 },
      { date: TODAY, pct: 48, meanTempC: 8 },
    ]
    expect(goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toMatchObject({ cold: false })
  })

  it('does not count a day without growth that was warm enough', () => {
    const increments = goidanichIncrements(series(-2, [40, 40, 40], 14), 12)
    expect(recentlyCold(increments, TODAY)).toBe(false)
  })

  it('ignores the forecast days after today', () => {
    const increments = goidanichIncrements(series(-2, [40, 48, 56, 56, 56], 8).map((d, i) => (i < 3 ? { ...d, meanTempC: 18 } : d)), 12)
    expect(recentlyCold(increments, TODAY)).toBe(false)
  })
})

describe('firstOffSeasonDate', () => {
  const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']
  const ended = (d: string) => d.slice(5) > '10-31'

  it('is the first day after the season end', () => {
    expect(firstOffSeasonDate(dates, ended)).toBe('2026-11-01')
  })

  it('is the first day of the window when the season ended before it', () => {
    expect(firstOffSeasonDate(dates.slice(2), ended)).toBe('2026-11-01')
  })

  it('is null for a window inside the season', () => {
    expect(firstOffSeasonDate(dates.slice(0, 2), ended)).toBeNull()
  })
})
