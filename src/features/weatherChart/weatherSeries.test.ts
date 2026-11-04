/**
 * File: weatherSeries.test.ts
 * Created: 2026-10-20
 * Description: Tests building the chart data from snapshots and hourly weather.
 */

import { describe, expect, it } from 'vitest'
import type { DailyRisk, HourlyWeather } from '../../db/schema'
import { groupByDay, type DayHours } from '../../rules'
import { buildWeatherSeries } from './weatherSeries'

function dayHours(date: string, temp: number, rh = 70, precip = 0): DayHours[] {
  const hours: HourlyWeather[] = Array.from({ length: 24 }, (_, h) => ({
    time: `${date}T${String(h).padStart(2, '0')}:00`,
    temperature2m: temp,
    relativeHumidity2m: rh,
    dewPoint2m: 0,
    precipitation: h === 0 ? precip : 0,
  }))
  return groupByDay(hours)
}

function row(partial: Partial<DailyRisk> & { date: string }): DailyRisk {
  return { vineyardId: 1, source: 'archive', ...partial }
}

describe('buildWeatherSeries', () => {
  it('covers exactly the requested window, one point per day, oldest first', () => {
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-05',
      storedRows: [],
      liveDays: [],
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(),
    })
    expect(series.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'])
  })

  it('prefers stored snapshot values over live day hours', () => {
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-01',
      storedRows: [row({ date: '2026-06-01', meanTempC: 18, precipitationMm: 3, meanRhPct: 80, source: 'archive' })],
      liveDays: dayHours('2026-06-01', 30),
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(),
    })
    expect(series[0].meanTempC).toBe(18)
    expect(series[0].source).toBe('archive')
  })

  it('keeps null before the indices are active, never 0', () => {
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-02',
      storedRows: [],
      liveDays: dayHours('2026-06-01', 20),
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(),
    })
    for (const p of series) {
      expect(p.goidanichPct).toBeNull()
      expect(p.gublerScore).toBeNull()
    }
  })

})
