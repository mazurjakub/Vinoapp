/**
 * File: openMeteoProvider.test.ts
 * Created: 2026-10-02
 * Description: Tests fetching and parsing of Open-Meteo responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDateKey } from '../features/weather/format'
import { openMeteoProvider } from './openMeteoProvider'

const HISTORICAL = 'historical-forecast-api.open-meteo.com'
const FORECAST = 'api.open-meteo.com'
const ARCHIVE = 'archive-api.open-meteo.com'

const daysAgo = (count: number) => localDateKey(new Date(Date.now() - count * 86400000))

function datesOf(url: URL): string[] {
  const dates: string[] = []
  const end = url.searchParams.get('end_date')!
  let current = url.searchParams.get('start_date')!
  while (current <= end) {
    dates.push(current)
    current = new Date(Date.parse(`${current}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  }
  return dates
}

/** A full 24-hour response for the requested range, leaving out `skip` dates. */
function respond(url: URL, skip: string[] = [], temperature = 10) {
  const time = datesOf(url)
    .filter((date) => !skip.includes(date))
    .flatMap((date) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`))
  return {
    ok: true,
    json: async () => ({
      hourly: {
        time,
        temperature_2m: time.map(() => temperature),
        relative_humidity_2m: time.map(() => 50),
        dew_point_2m: time.map(() => 0),
        precipitation: time.map(() => 0),
      },
    }),
  }
}

describe('openMeteoProvider.fetchHourlyRange', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: URL) => respond(url))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const calledHosts = () => fetchMock.mock.calls.map((call) => (call[0] as URL).host)
  const firstCall = () => fetchMock.mock.calls[0][0] as URL

  it('reads past days from Historical Forecast, on its forecast path', async () => {
    await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(30), daysAgo(10))
    expect(calledHosts()).toEqual([HISTORICAL])
    expect(firstCall().pathname).toBe('/v1/forecast')
  })

  it('reads the last few days from the forecast endpoint', async () => {
    await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(2), daysAgo(1))
    expect(calledHosts()).toEqual([FORECAST])
    expect(firstCall().searchParams.get('start_date')).toBe(daysAgo(2))
  })

  it('splits a range at the boundary without a gap or an overlap', async () => {
    const hours = await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(5), daysAgo(1))
    expect(calledHosts()).toEqual([HISTORICAL, FORECAST])
    const dates = [...new Set(hours.map((h) => h.time.slice(0, 10)))]
    expect(dates).toEqual([daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)])
    expect(hours.filter((h) => h.source === 'forecast')[0].time.slice(0, 10)).toBe(daysAgo(2))
    expect(hours).toHaveLength(5 * 24)
  })

  it('serves a day from the same endpoint wherever the range starts', async () => {
    await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(20), daysAgo(10))
    await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(200), daysAgo(10))
    expect(calledHosts()).toEqual([HISTORICAL, HISTORICAL])
  })

  it('asks the archive only for a day Historical Forecast does not return', async () => {
    const missing = daysAgo(15)
    fetchMock.mockImplementation(async (url: URL) =>
      url.host === HISTORICAL ? respond(url, [missing]) : respond(url, [], 20),
    )
    const hours = await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(20), daysAgo(10))
    expect(calledHosts()).toEqual([HISTORICAL, ARCHIVE])
    const archiveCall = fetchMock.mock.calls[1][0] as URL
    expect(archiveCall.searchParams.get('start_date')).toBe(missing)
    expect(archiveCall.searchParams.get('end_date')).toBe(missing)
    expect(hours.filter((h) => h.source === 'archive').every((h) => h.time.startsWith(missing))).toBe(true)
    expect(hours).toHaveLength(11 * 24)
    expect(hours.map((h) => h.time)).toEqual([...hours.map((h) => h.time)].sort())
  })

  it('falls back to the archive when Historical Forecast fails', async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      if (url.host === HISTORICAL) return { ok: false, status: 500, json: async () => ({}) }
      return respond(url)
    })
    const hours = await openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(20), daysAgo(10))
    expect(hours.every((h) => h.source === 'archive')).toBe(true)
  })

  it('fails when neither source answers, so the stored state stays', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    await expect(openMeteoProvider.fetchHourlyRange(49, 17, daysAgo(20), daysAgo(10))).rejects.toThrow()
  })

  it('drops an hour without a temperature, so it cannot lower a daily mean', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-10-01T00:00', '2026-10-01T01:00'],
          temperature_2m: [null, 10],
          relative_humidity_2m: [50, 50],
          dew_point_2m: [0, 0],
          precipitation: [0, 0],
        },
      }),
    })
    const hours = await openMeteoProvider.fetchHourly(49, 17)
    expect(hours.filter((h) => h.time.startsWith('2026-10-01')).map((h) => h.time)).toEqual(['2026-10-01T01:00'])
  })

  it('splits the cache by the same rule as the season sync', async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.host === FORECAST
        ? {
            ok: true,
            json: async () => ({
              hourly: {
                time: [`${daysAgo(2)}T00:00`],
                temperature_2m: [1],
                relative_humidity_2m: [50],
                dew_point_2m: [0],
                precipitation: [0],
              },
            }),
          }
        : respond(url),
    )
    const hours = await openMeteoProvider.fetchHourly(49, 17)
    expect(firstCall().host).toBe(FORECAST)
    expect(firstCall().searchParams.get('past_days')).toBe('2')
    const historical = fetchMock.mock.calls[1][0] as URL
    expect(historical.host).toBe(HISTORICAL)
    expect(historical.searchParams.get('start_date')).toBe(daysAgo(7))
    expect(historical.searchParams.get('end_date')).toBe(daysAgo(3))
    expect(hours.find((h) => h.time.startsWith(daysAgo(3)))?.source).toBe('historical-forecast')
    expect(hours.find((h) => h.time.startsWith(daysAgo(2)))?.source).toBe('forecast')
  })

  it('keeps the forecast when the older days of the cache cannot be read', async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.host === FORECAST ? respond(url) : { ok: false, status: 500, json: async () => ({}) },
    )
    // The forecast mock answers from start_date, which a past_days request doesn't have.
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        hourly: { time: ['2030-01-01T00:00'], temperature_2m: [1], relative_humidity_2m: [50], dew_point_2m: [0], precipitation: [0] },
      }),
    }))
    const hours = await openMeteoProvider.fetchHourly(49, 17)
    expect(hours.map((h) => h.source)).toEqual(['forecast'])
  })
})
