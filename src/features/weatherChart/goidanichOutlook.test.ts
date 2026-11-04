/**
 * File: goidanichOutlook.test.ts
 * Created: 2026-11-03
 * Description: Tests the Goidanich daily increments and the estimate of when the index reaches its thresholds.
 */

import { describe, expect, it } from 'vitest'
import { addDaysUTC } from '../../rules'
import { goidanichIncrements, goidanichOutlook, type GoidanichDay } from './goidanichOutlook'

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

  it('ignores the cycle before a spray restart', () => {
    // 95% before the spray, a gap, then a new cycle from a new primary event.
    const days = series(-5, [92, 95, null, 5, 12, 20, 30])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })
    expect(outlook).toMatchObject({ kind: 'cycle', alert: { status: 'notReached' }, urgent: { status: 'notReached' } })
  })

  it('estimates nothing after the season end', () => {
    const days = series(-2, [80, 95, null, null])
    const outlook = goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: (d) => d >= TODAY })
    expect(outlook).toEqual({ kind: 'seasonOver' })
  })

})

describe('cold in the outlook', () => {
  it('says so when the last days up to today added nothing in the cold', () => {
    const days = series(-3, [40, 50, 50, 50, 50], 8)
    expect(goidanichOutlook({ days, today: TODAY, thresholds: THRESHOLDS, minTempC: 12, isSeasonOver: inSeason })).toMatchObject({ kind: 'cycle', cold: true })
  })

})
