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

  it('marks only events inside the window, so an older one is not drawn at its edge', () => {
    const series = buildWeatherSeries({
      from: '2026-06-10',
      to: '2026-06-12',
      storedRows: [],
      liveDays: [],
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(['2026-06-01', '2026-06-11']),
    })
    expect(series.map((p) => p.primaryEvent)).toEqual([false, true, false])
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

  it('takes index values only from stored rows or the engine projection, never from its own maths', () => {
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-03',
      storedRows: [row({ date: '2026-06-01', goidanichPct: 12.5, gublerScore: 40 })],
      liveDays: [],
      goidanichProjected: new Map([['2026-06-02', 20]]),
      gublerProjected: new Map([['2026-06-02', 60]]),
      primaryEventDates: new Set(),
    })
    expect(series.map((p) => p.goidanichPct)).toEqual([12.5, 20, null])
    expect(series.map((p) => p.gublerScore)).toEqual([40, 60, null])
  })

  it('respects a stored row explicitly nulling an index, even if the projection has a value for that date', () => {
    // E.g. the day right after a downy spray deactivated Goidanich — the sync
    // wrote `goidanichPct: null` for it, but a stale/independent projection
    // might still compute something for that date. The stored null must win.
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-01',
      storedRows: [row({ date: '2026-06-01', goidanichPct: null, gublerScore: null })],
      liveDays: [],
      goidanichProjected: new Map([['2026-06-01', 42]]),
      gublerProjected: new Map([['2026-06-01', 77]]),
      primaryEventDates: new Set(),
    })
    expect(series[0].goidanichPct).toBeNull()
    expect(series[0].gublerScore).toBeNull()
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

  it('marks primary-infection days', () => {
    const series = buildWeatherSeries({
      from: '2026-06-01',
      to: '2026-06-03',
      storedRows: [],
      liveDays: [],
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(['2026-06-02']),
    })
    expect(series.map((p) => p.primaryEvent)).toEqual([false, true, false])
  })

  it('reports forecast-sourced days as forecast, so the chart can distinguish them', () => {
    const forecastDay = dayHours('2026-06-08', 22).map((d) => ({
      ...d,
      hours: d.hours.map((h) => ({ ...h, source: 'forecast' as const })),
    }))
    const series = buildWeatherSeries({
      from: '2026-06-08',
      to: '2026-06-08',
      storedRows: [],
      liveDays: forecastDay,
      goidanichProjected: new Map(),
      gublerProjected: new Map(),
      primaryEventDates: new Set(),
    })
    expect(series[0].source).toBe('forecast')
    expect(series[0].meanTempC).toBeCloseTo(22)
  })
})
