/**
 * File: weatherSeries.ts
 * Created: 2026-10-20
 * Description: Builds the daily chart data from saved snapshots and hourly weather.
 */

import type { DailyRisk, WeatherSource } from '../../db/schema'
import { addDaysUTC, dailyMeanTemperature, dailyPrecipitation, type DayHours } from '../../rules'

export interface WeatherPoint {
  date: string
  source: WeatherSource
  meanTempC: number | null
  precipitationMm: number | null
  meanRhPct: number | null
  /** `null` = the Goidanich index isn't active on this day (no primary event yet). */
  goidanichPct: number | null
  /** `null` = the Gubler-Thomas index isn't ignited on this day. */
  gublerScore: number | null
  primaryEvent: boolean
}

export interface BuildWeatherSeriesInput {
  from: string
  to: string
  /** Stored snapshot rows (elapsed days). They take precedence over anything computed here. */
  storedRows: DailyRisk[]
  /** Day hours for days without a snapshot (today, the forecast, and elapsed days the sync hasn't reached yet). */
  liveDays: DayHours[]
  /** Index values computed in memory by the engine for the days without a stored value. */
  goidanichProjected: Map<string, number>
  gublerProjected: Map<string, number | null>
  /** Dates with a recorded downy-mildew primary infection. */
  primaryEventDates: Set<string>
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDaysUTC(d, 1)) out.push(d)
  return out
}

/** One row per day in [from, to], from stored snapshots and the projection. */
export function buildWeatherSeries(input: BuildWeatherSeriesInput): WeatherPoint[] {
  const stored = new Map(input.storedRows.map((r) => [r.date, r]))
  const live = new Map(input.liveDays.map((d) => [d.date, d]))

  return datesBetween(input.from, input.to).map((date) => {
    const row = stored.get(date)
    const day = live.get(date)
    const hours = day?.hours ?? []
    const hasHours = hours.length > 0

    return {
      date,
      source: row?.source ?? hours[0]?.source ?? 'forecast',
      meanTempC: row?.meanTempC ?? (hasHours ? dailyMeanTemperature(hours) : null),
      precipitationMm: row?.precipitationMm ?? (hasHours ? dailyPrecipitation(hours) : null),
      meanRhPct: row?.meanRhPct ?? (hasHours ? hours.reduce((sum, h) => sum + h.relativeHumidity2m, 0) / hours.length : null),
      // A stored null means inactive, so `??` can't be used here.
      goidanichPct: row ? row.goidanichPct ?? null : (input.goidanichProjected.get(date) ?? null),
      gublerScore: row ? row.gublerScore ?? null : (input.gublerProjected.get(date) ?? null),
      primaryEvent: input.primaryEventDates.has(date),
    }
  })
}
