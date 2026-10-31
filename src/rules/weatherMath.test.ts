/**
 * File: weatherMath.test.ts
 * Created: 2026-10-02
 * Description: Tests the weather calculation helpers.
 */

import { describe, expect, it } from 'vitest'
import {
  dailyMaxTemperature,
  dailyMeanTemperature,
  dailyPrecipitation,
  daysBetween,
  degreeDaySum,
  estimateLeafWetnessHours,
  groupByDay,
  longestConsecutiveRun,
} from './weatherMath'
import { makeDay, makeHour } from './testUtils'

describe('groupByDay', () => {
  it('groups hourly entries by their local date and sorts days chronologically', () => {
    const hourly = [...makeDay('2026-06-02'), ...makeDay('2026-06-01')]
    const days = groupByDay(hourly)
    expect(days.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02'])
    expect(days[0].hours).toHaveLength(24)
  })
})

describe('daily aggregates', () => {
  it('computes max and mean temperature and total precipitation', () => {
    const hours = makeDay('2026-06-01', (h) => ({ temperature2m: h, precipitation: 1 }))
    expect(dailyMaxTemperature(hours)).toBe(23)
    expect(dailyMeanTemperature(hours)).toBeCloseTo(11.5)
    expect(dailyPrecipitation(hours)).toBe(24)
  })
})

describe('estimateLeafWetnessHours', () => {
  it('counts hours with high humidity or temperature close to dew point', () => {
    const hours = [
      makeHour('2026-06-01', 0, { relativeHumidity2m: 95, dewPoint2m: 0, temperature2m: 10 }),
      makeHour('2026-06-01', 1, { relativeHumidity2m: 40, dewPoint2m: 9, temperature2m: 10 }),
      makeHour('2026-06-01', 2, { relativeHumidity2m: 40, dewPoint2m: 0, temperature2m: 10 }),
    ]
    expect(estimateLeafWetnessHours(hours, 90, 2)).toBe(2)
  })
})

describe('longestConsecutiveRun', () => {
  it('finds the longest run of hours matching a predicate', () => {
    const hours = makeDay('2026-07-01', (h) => ({ temperature2m: h >= 10 && h <= 14 ? 25 : 5 }))
    expect(longestConsecutiveRun(hours, (h) => h.temperature2m >= 21)).toBe(5)
  })

  it('returns 0 when nothing matches', () => {
    const hours = makeDay('2026-07-01')
    expect(longestConsecutiveRun(hours, (h) => h.temperature2m >= 21)).toBe(0)
  })
})

describe('daysBetween', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-05-01', '2026-05-15')).toBe(14)
    expect(daysBetween('2026-05-01', '2026-05-01')).toBe(0)
  })
})

describe('degreeDaySum', () => {
  it('sums positive degree-days above the base temperature', () => {
    const hourly = [
      ...makeDay('2026-04-01', () => ({ temperature2m: 10 })), // mean 10, base 8 -> +2
      ...makeDay('2026-04-02', () => ({ temperature2m: 6 })), // mean 6, base 8 -> clipped to 0
      ...makeDay('2026-04-03', () => ({ temperature2m: 13 })), // mean 13, base 8 -> +5
    ]
    expect(degreeDaySum(hourly, '2026-04-01', '2026-04-03', 8)).toBeCloseTo(7)
  })
})
