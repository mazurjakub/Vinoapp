/**
 * File: openMeteoProvider.ts
 * Created: 2026-10-25
 * Description: Weather provider that fetches hourly data from the Open-Meteo forecast and archive APIs.
 */

import type { HourlyWeather, WeatherSource } from '../db/schema'
import { localDateKey } from '../features/weather/format'
import type { WeatherProvider } from './weatherProvider'

interface OpenMeteoResponse {
  hourly: {
    time: string[]
    temperature_2m: (number | null)[]
    relative_humidity_2m: (number | null)[]
    dew_point_2m: (number | null)[]
    precipitation: (number | null)[]
  }
}

/** Days this recent come from the forecast endpoint, older ones from Historical Forecast. */
const FORECAST_RECENT_DAYS = 2

/** A day with fewer valid hours counts as not returned by Historical Forecast, so the archive may fill it. */
const MIN_HOURS_PER_DAY = 18

const CACHE_PAST_DAYS = 7
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const HISTORICAL_FORECAST_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

const HOURLY_PARAMS = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation'

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/** An hour without a temperature or humidity is dropped: as a null it would count as 0 in a daily mean. */
function parseResponse(data: OpenMeteoResponse, source?: WeatherSource): HourlyWeather[] {
  return data.hourly.time.flatMap((time, index) => {
    const temperature2m = data.hourly.temperature_2m[index]
    const relativeHumidity2m = data.hourly.relative_humidity_2m[index]
    if (temperature2m === null || relativeHumidity2m === null) return []
    return [
      {
        time,
        temperature2m,
        relativeHumidity2m,
        dewPoint2m: data.hourly.dew_point_2m[index] ?? 0,
        precipitation: data.hourly.precipitation[index] ?? 0,
        ...(source ? { source } : {}),
      },
    ]
  })
}

async function runQuery(url: URL, source?: WeatherSource): Promise<HourlyWeather[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Open-Meteo returned status ${response.status}`)
  }
  return parseResponse((await response.json()) as OpenMeteoResponse, source)
}

/** The cache uses the same split as fetchHourlyRange. If the older days fail, the forecast is still kept. */
async function fetchHourly(lat: number, lon: number): Promise<HourlyWeather[]> {
  const today = localDateKey(new Date())
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', HOURLY_PARAMS)
  // `forecast_days` counts today, so 8 = today + the 7 days the chart shows ahead.
  url.searchParams.set('forecast_days', '8')
  url.searchParams.set('past_days', String(FORECAST_RECENT_DAYS))
  url.searchParams.set('timezone', 'Europe/Prague')
  const recent = await runQuery(url, 'forecast')
  const pastStart = addDays(today, -CACHE_PAST_DAYS)
  const pastEnd = addDays(today, -FORECAST_RECENT_DAYS - 1)
  try {
    return [...(await fetchPastDays(lat, lon, pastStart, pastEnd)), ...recent]
  } catch {
    return recent
  }
}

function fetchRange(
  endpoint: string,
  source: WeatherSource,
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<HourlyWeather[]> {
  const url = new URL(endpoint)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', HOURLY_PARAMS)
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)
  url.searchParams.set('timezone', 'Europe/Prague')
  return runQuery(url, source)
}

const hoursPerDay = (hours: HourlyWeather[]) => {
  const counts = new Map<string, number>()
  for (const hour of hours) counts.set(hour.time.slice(0, 10), (counts.get(hour.time.slice(0, 10)) ?? 0) + 1)
  return counts
}

/**
 * Historical Forecast, with the ERA5 archive only for days it doesn't return.
 * ERA5 is a different, coarser model, so a day from it can differ from its
 * neighbours; the hours stay tagged 'archive'.
 */
async function fetchPastDays(lat: number, lon: number, startDate: string, endDate: string): Promise<HourlyWeather[]> {
  let primary: HourlyWeather[] = []
  let primaryError: unknown
  try {
    primary = await fetchRange(HISTORICAL_FORECAST_URL, 'historical-forecast', lat, lon, startDate, endDate)
  } catch (error) {
    primaryError = error
  }

  const counts = hoursPerDay(primary)
  const missing: string[] = []
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if ((counts.get(date) ?? 0) < MIN_HOURS_PER_DAY) missing.push(date)
  }
  if (missing.length === 0) return primary

  let fallback: HourlyWeather[]
  try {
    fallback = await fetchRange(ARCHIVE_URL, 'archive', lat, lon, missing[0], missing[missing.length - 1])
  } catch (error) {
    if (primaryError) throw primaryError
    if (primary.length === 0) throw error
    return primary
  }
  const missingSet = new Set(missing)
  const fallbackCounts = hoursPerDay(fallback)
  const useFallback = (date: string) => missingSet.has(date) && (fallbackCounts.get(date) ?? 0) > (counts.get(date) ?? 0)
  return [
    ...primary.filter((hour) => !useFallback(hour.time.slice(0, 10))),
    ...fallback.filter((hour) => useFallback(hour.time.slice(0, 10))),
  ].sort((a, b) => a.time.localeCompare(b.time))
}

/**
 * Historical range, both dates inclusive. The endpoint depends only on the day's age, so a
 * season stays on the same models (ERA5 gave different Goidanich results).
 */
async function fetchHourlyRange(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<HourlyWeather[]> {
  const today = localDateKey(new Date())
  const pastCeiling = addDays(today, -FORECAST_RECENT_DAYS - 1)
  const pastEnd = endDate < pastCeiling ? endDate : pastCeiling

  const parts: HourlyWeather[][] = []
  if (startDate <= pastEnd) {
    parts.push(await fetchPastDays(lat, lon, startDate, pastEnd))
  }
  const dayAfterPast = addDays(pastEnd, 1)
  const recentStart = startDate > dayAfterPast ? startDate : dayAfterPast
  if (recentStart <= endDate) {
    parts.push(await fetchRange(FORECAST_URL, 'forecast', lat, lon, recentStart, endDate))
  }
  return parts.flat()
}

export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  fetchHourly,
  fetchHourlyRange,
}
