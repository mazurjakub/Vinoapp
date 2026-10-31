/**
 * File: syncSeasonState.test.ts
 * Created: 2026-10-20
 * Description: Tests the season sync, including gap filling, resets and network failures.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { getSetting, setSetting } from '../../db/settingsRepo'
import { buildWeatherSeries } from '../weatherChart/weatherSeries'
import { listDailyRiskWindow } from './dailyRiskRepo'
import type { HourlyWeather, Vineyard } from '../../db/schema'
import {
  addDaysUTC,
  advanceGoidanichCycle,
  dailyMeanTemperature,
  GOIDANICH_ENGINE_VERSION,
  groupByDay,
  initialGoidanichCycleState,
  REGION_PROFILES,
  type GoidanichCycleState,
  type GoidanichState,
  type GublerThomasState,
} from '../../rules'
import { localDateKey } from '../weather/format'
import { syncVineyardSeasonState, syncVineyardSeasonStateOnce } from './syncSeasonState'

const VINEYARD_ID = 555000111

function makeVineyard(overrides: Partial<Vineyard> = {}): Vineyard {
  const now = new Date().toISOString()
  return {
    id: VINEYARD_ID,
    name: 'Test',
    lat: 49.0,
    lon: 17.0,
    regionProfile: 'cz-morava',
    varietyId: 1,
    plantedYear: 2020,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Builds hourly entries for `date` at a constant temperature/humidity/precipitation. */
function hourlyForDay(date: string, temperature2m: number, relativeHumidity2m = 50, precipitation = 0): HourlyWeather[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature2m,
    relativeHumidity2m,
    dewPoint2m: 0,
    precipitation,
  }))
}

const year = new Date().getFullYear()
const budbreak = `${year}-04-01`

async function cleanup() {
  await db.vineyards.delete(VINEYARD_ID)
  await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.sprays.where('vineyardId').equals(VINEYARD_ID).delete()
  const keysToClear = [
    `degreeSum:${VINEYARD_ID}:${year}:cz-morava`,
    `goidanichState:${VINEYARD_ID}:${year}`,
    `gublerThomasState:${VINEYARD_ID}:${year}`,
    `lastSeasonSync:${VINEYARD_ID}`,
    `daySource:${VINEYARD_ID}:${year}`,
  ]
  for (const key of keysToClear) {
    const row = await db.settings.where('key').equals(key).first()
    if (row?.id !== undefined) await db.settings.delete(row.id)
  }
}

afterEach(cleanup)

describe('syncVineyardSeasonState', () => {
  it('accumulates SET8,0 across repeated calls instead of losing history to a short cache window', async () => {
    const vineyard = makeVineyard()
    // Each call only "sees" a couple of days (simulating the rolling cache),
    // but across several calls the degree-sum should still add up correctly.
    const day1 = `${year}-04-01`
    const day2 = `${year}-04-02`
    const day3 = `${year}-04-03`

    await syncVineyardSeasonState(vineyard, { budbreak }, [...hourlyForDay(day1, 18), ...hourlyForDay(day2, 18)])
    await syncVineyardSeasonState(vineyard, { budbreak }, [...hourlyForDay(day2, 18), ...hourlyForDay(day3, 18)])

    const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
    const record = await getSetting<{ state: number; lastProcessedDate: string }>(key)
    // 3 elapsed days at (18-8)=10 DS each = 30, not just the last call's 2 days
    expect(record?.state).toBe(30)
    expect(record?.lastProcessedDate).toBe(day3)
  })

  it('does not double-count a day seen again in a later call (idempotency)', async () => {
    const vineyard = makeVineyard()
    const day1 = `${year}-04-01`
    const day2 = `${year}-04-02`

    await syncVineyardSeasonState(vineyard, { budbreak }, [...hourlyForDay(day1, 18), ...hourlyForDay(day2, 18)])
    await syncVineyardSeasonState(vineyard, { budbreak }, [...hourlyForDay(day1, 18), ...hourlyForDay(day2, 18)])

    const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
    const record = await getSetting<{ state: number }>(key)
    expect(record?.state).toBe(20) // 2 days * 10 DS, not 40
  })

  it('fetches missing historical days when the cache window has a gap', async () => {
    const vineyard = makeVineyard()
    const day1 = `${year}-04-01`
    const gapDay = `${year}-04-02`
    const day3 = `${year}-04-03`

    const fetchHistoricalHourly = vi.fn(async () => hourlyForDay(gapDay, 18))

    // first call establishes day1 as processed
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(day1, 18), { fetchHistoricalHourly })
    // second call's cache has jumped ahead, skipping gapDay entirely
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(day3, 18), { fetchHistoricalHourly })

    expect(fetchHistoricalHourly).toHaveBeenCalled()
    const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
    const record = await getSetting<{ state: number; lastProcessedDate: string }>(key)
    expect(record?.lastProcessedDate).toBe(day3)
    expect(record?.state).toBe(30) // all 3 days, including the backfilled gap day
  })

  describe('recomputing the last 7 days', () => {
    const today = localDateKey(new Date())
    const yesterday = addDaysUTC(today, -1)
    const windowStart = addDaysUTC(today, -7)
    const seasonStart = addDaysUTC(today, -12)
    const eventDay = addDaysUTC(today, -8)
    const serveAt = (temperature: (date: string) => number) =>
      vi.fn(async (_lat: number, _lon: number, start: string, end: string) => {
        const out: HourlyWeather[] = []
        for (let d = start; d <= end; d = addDaysUTC(d, 1)) out.push(...hourlyForDay(d, temperature(d)))
        return out
      })

    it('shows a day the same in the table and the engine, and leaves older days alone', async () => {
      const vineyard = makeVineyard()
      const now = new Date().toISOString()
      await db.infectionEvents.add({ vineyardId: VINEYARD_ID, date: eventDay, disease: 'downy', type: 'primary', rule: 'manual-test', status: 'active' as const, createdAt: now, updatedAt: now })
      const phenology = { budbreak: seasonStart }

      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), { fetchHistoricalHourly: serveAt(() => 14) })

      // The download changes every day now; only the window may take it over.
      const revised = serveAt((d) => (d >= windowStart ? 13 : 30))
      const result = await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), { fetchHistoricalHourly: revised })
      expect(result.ok).toBe(true)
      expect(revised.mock.calls.map((call) => [call[2], call[3]])).toEqual([[windowStart, yesterday]])

      let expected: GoidanichCycleState = initialGoidanichCycleState()
      const pctByDate = new Map<string, number>()
      for (let d = eventDay; d <= yesterday; d = addDaysUTC(d, 1)) {
        const [day] = groupByDay(hourlyForDay(d, d >= windowStart ? 13 : 14))
        expected = advanceGoidanichCycle(expected, day, {
          primaryEventDates: new Set([eventDay]),
          stallDays: REGION_PROFILES['cz-morava'].secondaryInfection.stallDays,
        }).state
        pctByDate.set(d, expected.accumulatedPct)
      }
      const record = await getSetting<{ state: GoidanichCycleState }>(`goidanichState:${VINEYARD_ID}:${year}`)
      expect(expected.status).toBe('running')
      expect(record?.state.accumulatedPct).toBe(expected.accumulatedPct)

      const series = buildWeatherSeries({
        from: seasonStart,
        to: yesterday,
        storedRows: await listDailyRiskWindow(VINEYARD_ID, seasonStart, yesterday),
        liveDays: [],
        goidanichProjected: new Map(),
        gublerProjected: new Map(),
        primaryEventDates: new Set(),
      })
      const row = (date: string) => series.find((p) => p.date === date)!
      expect(row(yesterday).meanTempC).toBe(dailyMeanTemperature(hourlyForDay(yesterday, 13)))
      expect(row(yesterday).goidanichPct).toBe(pctByDate.get(yesterday))
      expect(row(eventDay).meanTempC).toBe(14)
      expect(row(eventDay).goidanichPct).toBe(pctByDate.get(eventDay))

      const degreeSum = await getSetting<{ state: number }>(`degreeSum:${VINEYARD_ID}:${year}:cz-morava`)
      expect(degreeSum?.state).toBeCloseTo(5 * (14 - 8) + 7 * (13 - 8), 6)
    })

    it('fetches the days that left the window since the last sync, once', async () => {
      const vineyard = makeVineyard()
      const phenology = { budbreak: seasonStart }
      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), { fetchHistoricalHourly: serveAt(() => 14) })
      const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
      const record = await getSetting<{ state: number; lastProcessedDate: string; resetFromDate: string; checkpoint: { date: string; state: number } }>(key)
      await setSetting(key, { ...record, checkpoint: { date: addDaysUTC(windowStart, -3), state: 0 } })

      const serving = serveAt(() => 14)
      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), { fetchHistoricalHourly: serving })
      expect(serving.mock.calls.map((call) => [call[2], call[3]])).toContainEqual([addDaysUTC(windowStart, -2), addDaysUTC(windowStart, -1)])
      const after = await getSetting<{ checkpoint: { date: string } }>(key)
      expect(after?.checkpoint.date).toBe(addDaysUTC(windowStart, -1))
    })

    it('keeps the state and reports it when the download fails', async () => {
      const vineyard = makeVineyard()
      const phenology = { budbreak: seasonStart }
      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), { fetchHistoricalHourly: serveAt(() => 14) })
      const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
      const before = await getSetting<{ state: number }>(key)

      const result = await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 14), {
        fetchHistoricalHourly: vi.fn(async () => {
          throw new Error('network down')
        }),
      })
      expect(result.failedSections).toContain('recentDays')
      expect((await getSetting<{ state: number }>(key))?.state).toBe(before?.state)
    })

    it('leaves two concurrent syncs with the same state as one, and queues only one more run', async () => {
      const OTHER_ID = VINEYARD_ID + 1
      const phenology = { budbreak: seasonStart }
      const cached = hourlyForDay(yesterday, 14)
      const keys = (id: number) => [`degreeSum:${id}:${year}:cz-morava`, `gublerThomasState:${id}:${year}`]

      try {
        await syncVineyardSeasonState(makeVineyard({ id: OTHER_ID }), phenology, cached, { fetchHistoricalHourly: serveAt(() => 14) })

        const serving = serveAt(() => 14)
        const deps = { fetchHistoricalHourly: serving }
        const results = await Promise.all([
          syncVineyardSeasonState(makeVineyard(), phenology, cached, deps),
          syncVineyardSeasonState(makeVineyard(), phenology, cached, deps),
          syncVineyardSeasonState(makeVineyard(), phenology, cached, deps),
        ])
        expect(results.every((r) => r.ok)).toBe(true)
        expect(serving.mock.calls.filter((call) => call[2] === windowStart && call[3] === yesterday)).toHaveLength(2)

        const [single, concurrent] = await Promise.all(
          [OTHER_ID, VINEYARD_ID].map((id) => Promise.all(keys(id).map((key) => getSetting(key)))),
        )
        expect(concurrent).toEqual(single)
      } finally {
        await db.settings.filter((s) => s.key.includes(`:${OTHER_ID}:`) || s.key.endsWith(`:${OTHER_ID}`)).delete()
        await db.dailyRisk.where('vineyardId').equals(OTHER_ID).delete()
      }
    })

    it('skips a sync that would see the same data, but not after something changed', async () => {
      const vineyard = makeVineyard()
      const phenology = { budbreak: seasonStart }
      const cached = hourlyForDay(yesterday, 14)
      await syncVineyardSeasonState(vineyard, phenology, cached, { fetchHistoricalHourly: serveAt(() => 14) })

      const serving = serveAt(() => 14)
      expect(await syncVineyardSeasonStateOnce(vineyard, phenology, cached, { fetchHistoricalHourly: serving })).toBeUndefined()
      expect(serving).not.toHaveBeenCalled()

      const now = new Date().toISOString()
      const sprayId = await db.sprays.add({ vineyardId: VINEYARD_ID, datetime: `${yesterday}T10:00`, product: 'x', activeSubstance: 'x', dose: '1', target: 'downy', createdAt: now, updatedAt: now } as never)
      try {
        await syncVineyardSeasonStateOnce(vineyard, phenology, cached, { fetchHistoricalHourly: serving })
        expect(serving).toHaveBeenCalled()
      } finally {
        await db.sprays.delete(sprayId as number)
      }
    })

    it('does not start a Goidanich cycle from a revoked event', async () => {
      const vineyard = makeVineyard()
      const now = new Date().toISOString()
      await db.infectionEvents.add({
        vineyardId: VINEYARD_ID,
        date: eventDay,
        disease: 'downy',
        type: 'primary',
        rule: 'downy-primary-cz-morava',
        status: 'revoked',
        revokedAt: now,
        revokedReason: 'refinedDataNotMet',
        createdAt: now,
        updatedAt: now,
      })
      await syncVineyardSeasonState(vineyard, {}, hourlyForDay(yesterday, 20), { fetchHistoricalHourly: serveAt(() => 20) })
      expect(await getSetting(`goidanichState:${VINEYARD_ID}:${year}`)).toBeUndefined()
    })

    it('revokes an event the rule recorded on a day that no longer qualifies, but not a manual one', async () => {
      const vineyard = makeVineyard()
      const phenology = { budbreak: seasonStart }
      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 5), { fetchHistoricalHourly: serveAt(() => 5) })
      const now = new Date().toISOString()
      const event = { vineyardId: VINEYARD_ID, disease: 'downy' as const, type: 'primary' as const, status: 'active' as const, createdAt: now, updatedAt: now }
      await db.infectionEvents.bulkAdd([
        { ...event, date: yesterday, rule: 'downy-primary-cz-morava' },
        { ...event, date: addDaysUTC(today, -2), rule: 'manual-test' },
      ])

      await syncVineyardSeasonState(vineyard, phenology, hourlyForDay(yesterday, 5), { fetchHistoricalHourly: serveAt(() => 5) })
      const events = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).sortBy('date')
      expect(events.map((e) => [e.date, e.status])).toEqual([
        [addDaysUTC(today, -2), 'active'],
        [yesterday, 'revoked'],
      ])
      expect(events[1].revokedReason).toBe('refinedDataNotMet')
    })
  })

  it('does not re-read a finished day once it has been processed', async () => {
    const vineyard = makeVineyard()
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(budbreak, 18))
    const fetchHistoricalHourly = vi.fn(async () => [])
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(budbreak, 18), { fetchHistoricalHourly })
    expect(fetchHistoricalHourly).not.toHaveBeenCalled()
  })

  it('replays a season computed from the old source once, and only drops the old log after success', async () => {
    const vineyard = makeVineyard()
    const logKey = `daySource:${VINEYARD_ID}:${year}`
    const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(budbreak, 18))
    await setSetting(logKey, { [budbreak]: 'archive' })
    const before = await getSetting<{ state: number }>(key)

    const failing = vi.fn(async () => {
      throw new Error('network down')
    })
    await syncVineyardSeasonState(vineyard, { budbreak }, [], { fetchHistoricalHourly: failing })
    expect(await getSetting(logKey)).toBeDefined()
    expect((await getSetting<{ state: number }>(key))?.state).toBe(before?.state)

    const serving = vi.fn(async (_lat: number, _lon: number, start: string, end: string) => {
      const out: HourlyWeather[] = []
      for (let d = start; d <= end; d = addDaysUTC(d, 1)) out.push(...hourlyForDay(d, 18))
      return out
    })
    await syncVineyardSeasonState(vineyard, { budbreak }, [], { fetchHistoricalHourly: serving })
    expect(serving).toHaveBeenCalled()
    expect(await getSetting(logKey)).toBeUndefined()

    serving.mockClear()
    await syncVineyardSeasonState(vineyard, { budbreak }, [], { fetchHistoricalHourly: serving })
    expect(serving).not.toHaveBeenCalled()
  })

  it('leaves the persisted state unchanged and reports failure when the historical fetch errors out', async () => {
    const vineyard = makeVineyard()
    const day1 = `${year}-04-01`
    const gapDay = `${year}-04-02`
    const day3 = `${year}-04-03`

    const workingFetch = vi.fn(async () => hourlyForDay(gapDay, 18))
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(day1, 18), {
      fetchHistoricalHourly: workingFetch,
    })
    const before = await getSetting<{ state: number; lastProcessedDate: string }>(
      `degreeSum:${VINEYARD_ID}:${year}:cz-morava`,
    )

    const failingFetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const result = await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(day3, 18), {
      fetchHistoricalHourly: failingFetch,
    })

    expect(result.ok).toBe(false)
    expect(result.failedSections).toContain('degreeSum')

    const after = await getSetting<{ state: number; lastProcessedDate: string }>(
      `degreeSum:${VINEYARD_ID}:${year}:cz-morava`,
    )
    // completely unchanged — not partially advanced, not corrupted
    expect(after).toEqual(before)

    const syncStatus = await getSetting<{ ok: boolean; failedSections: string[] }>(`lastSeasonSync:${VINEYARD_ID}`)
    expect(syncStatus?.ok).toBe(false)
  })

  it('records a primary infection event once the degree sum crosses 170 DS, and starts the Goidanich index from that date', async () => {
    const vineyard = makeVineyard()
    // 18 consecutive days at (18-8)=10 DS/day = 180 DS, with rain on the last day
    const hourly: HourlyWeather[] = []
    const dates: string[] = []
    const start = Date.UTC(year, 3, 1)
    for (let i = 0; i < 18; i++) {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10)
      dates.push(date)
      const isLast = i === 17
      hourly.push(...hourlyForDay(date, 18, 50, isLast ? 15 : 0))
    }

    await syncVineyardSeasonState(vineyard, { budbreak }, hourly)

    const events = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).toArray()
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].disease).toBe('downy')
    expect(events[0].type).toBe('primary')

    const goidanichRecord = await getSetting<{ state: GoidanichState; resetFromDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    expect(goidanichRecord?.resetFromDate).toBe(events[0].date)
  })

  it('accumulates the Gubler-Thomas index across repeated calls', async () => {
    const vineyard = makeVineyard()
    const day1 = `${year}-06-01`
    const day2 = `${year}-06-02`
    const day3 = `${year}-06-03`

    const qualifyingHours = (date: string) =>
      Array.from({ length: 24 }, (_, hour) => ({
        time: `${date}T${String(hour).padStart(2, '0')}:00`,
        temperature2m: hour >= 10 && hour < 18 ? 25 : 10,
        relativeHumidity2m: 50,
        dewPoint2m: 0,
        precipitation: 0,
      }))

    // No budbreak recorded, so the Gubler-Thomas anchor falls back to Jan 1st
    // of the current year — stub the historical fetch so the (irrelevant)
    // Jan-to-May gap doesn't trigger a real network call in this test.
    const fetchHistoricalHourly = vi.fn(async () => [])

    await syncVineyardSeasonState(vineyard, {}, [...qualifyingHours(day1), ...qualifyingHours(day2)], {
      fetchHistoricalHourly,
    })
    await syncVineyardSeasonState(vineyard, {}, [...qualifyingHours(day2), ...qualifyingHours(day3)], {
      fetchHistoricalHourly,
    })

    const record = await getSetting<{ state: GublerThomasState; lastProcessedDate: string }>(
      `gublerThomasState:${VINEYARD_ID}:${year}`,
    )
    expect(record?.lastProcessedDate).toBe(day3)
    expect(record?.state.ignited).toBe(true)
    expect(record?.state.score).toBe(60) // 3 consecutive qualifying days, not reprocessed
  })

  it('restarts the degree-sum from scratch when budbreak is corrected to an earlier date', async () => {
    const vineyard = makeVineyard()
    const day1 = `${year}-04-05`
    await syncVineyardSeasonState(vineyard, { budbreak: day1 }, hourlyForDay(day1, 18))

    const correctedBudbreak = `${year}-04-01`
    const allDays = [`${year}-04-01`, `${year}-04-02`, `${year}-04-03`, `${year}-04-04`, day1]
    const hourly = allDays.flatMap((d) => hourlyForDay(d, 18))
    await syncVineyardSeasonState(vineyard, { budbreak: correctedBudbreak }, hourly)

    const key = `degreeSum:${VINEYARD_ID}:${year}:cz-morava`
    const record = await getSetting<{ state: number; resetFromDate: string }>(key)
    expect(record?.resetFromDate).toBe(correctedBudbreak)
    expect(record?.state).toBe(50) // 5 days * 10 DS, recomputed fresh (not carried over from the old run)
  })

  async function triggerPrimaryEvent(vineyard: Vineyard): Promise<string> {
    const hourly: HourlyWeather[] = []
    const start = Date.UTC(year, 3, 1)
    for (let i = 0; i < 18; i++) {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10)
      const isLast = i === 17
      hourly.push(...hourlyForDay(date, 18, 50, isLast ? 15 : 0))
    }
    await syncVineyardSeasonState(vineyard, { budbreak }, hourly)
    const events = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).sortBy('date')
    return events[0].date
  }

  it('deactivates the Goidanich index after a downy spray until a new primary event', async () => {
    const vineyard = makeVineyard()
    const eventDate = await triggerPrimaryEvent(vineyard)

    // let the index accumulate a bit from the event before the spray happens
    const dayAfterEvent = `${year}-05-01`
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(dayAfterEvent, 20, 90, 20))
    const beforeSpray = await getSetting<{ state: GoidanichState; resetFromDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    expect(beforeSpray?.resetFromDate).toBe(eventDate)
    expect(beforeSpray!.state.accumulatedPct).toBeGreaterThan(0)

    const sprayDate = `${year}-05-02`
    const now = new Date().toISOString()
    await db.sprays.add({
      vineyardId: VINEYARD_ID,
      datetime: `${sprayDate}T08:00`,
      product: 'Test fungicide',
      activeSubstance: 'test',
      dose: '1 l/ha',
      target: 'downy',
      createdAt: now,
      updatedAt: now,
    })

    const dayAfterSpray = `${year}-05-03`
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(dayAfterSpray, 15, 50, 0), {
      fetchHistoricalHourly: async () => [],
    })

    // The stored record is untouched (no temperature-only restart at the spray date)...
    const afterSpray = await getSetting<{ state: GoidanichState; resetFromDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    expect(afterSpray).toEqual(beforeSpray)
    // ...and the snapshot for the day after the spray is explicitly nulled, not
    // left at whatever the pre-spray accumulation happened to be.
    const snapshotAfterSpray = await db.dailyRisk
      .where('[vineyardId+date]')
      .equals([VINEYARD_ID, dayAfterSpray])
      .first()
    expect(snapshotAfterSpray?.goidanichPct).toBeNull()

    // A new primary event after the spray reactivates it from that event's
    // date, not from the spray date.
    const newEventHourly: HourlyWeather[] = []
    const newEventStart = Date.UTC(year, 4, 10) // well after the spray
    let newEventDate = ''
    for (let i = 0; i < 2; i++) {
      const date = new Date(newEventStart + i * 86400000).toISOString().slice(0, 10)
      const isLast = i === 1
      newEventHourly.push(...hourlyForDay(date, 18, 50, isLast ? 15 : 0))
      if (isLast) newEventDate = date
    }
    await syncVineyardSeasonState(vineyard, { budbreak }, newEventHourly, { fetchHistoricalHourly: async () => [] })

    const events = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).sortBy('date')
    expect(events.some((e) => e.date === newEventDate)).toBe(true)

    const afterReactivation = await getSetting<{ state: GoidanichState; resetFromDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    expect(afterReactivation?.resetFromDate).toBe(newEventDate)
  })

  describe('replay of a Goidanich state from an older calculation', () => {
    const key = `goidanichState:${VINEYARD_ID}:${year}`

    async function storeOldState(eventDate: string, lastProcessedDate: string) {
      await db.settings.where('key').equals(key).delete()
      await db.settings.add({
        key,
        value: {
          state: { secondaryDetected: true, accumulatedPct: 95, alertLevel: 'warning' },
          lastProcessedDate,
          resetFromDate: eventDate,
        },
      })
    }

    it('keeps the stored state when the fetch fails, then replaces it after a successful replay', async () => {
      const vineyard = makeVineyard()
      const eventDate = await triggerPrimaryEvent(vineyard)
      const lastProcessedDate = addDaysUTC(eventDate, 10)
      await storeOldState(eventDate, lastProcessedDate)

      const failing = vi.fn(async () => {
        throw new Error('offline')
      })
      const offline = await syncVineyardSeasonState(vineyard, { budbreak }, [], { fetchHistoricalHourly: failing })
      expect(offline.failedSections).toContain('goidanich')
      const kept = await getSetting<{ state: { accumulatedPct: number } }>(key)
      expect(kept?.state.accumulatedPct).toBe(95)

      const yesterday = addDaysUTC(localDateKey(new Date()), -1)
      const fetching = vi.fn(async (_lat: number, _lon: number, start: string, end: string) => {
        const hours: HourlyWeather[] = []
        for (let date = start; date <= end; date = addDaysUTC(date, 1)) hours.push(...hourlyForDay(date, 5))
        return hours
      })
      await syncVineyardSeasonState(vineyard, { budbreak }, [], { fetchHistoricalHourly: fetching })

      expect(fetching).toHaveBeenCalledWith(vineyard.lat, vineyard.lon, eventDate, yesterday)
      const replayed = await getSetting<{ state: GoidanichCycleState; lastProcessedDate: string }>(key)
      expect(replayed?.state.engineVersion).toBe(GOIDANICH_ENGINE_VERSION)
      expect(replayed?.state.accumulatedPct).toBe(0)
      expect(replayed?.state.startDate).toBe(eventDate)
    })
  })

  it('sets Gubler-Thomas to zero the day after a powdery spray', async () => {
    const vineyard = makeVineyard()
    const qualifyingDay = (date: string) =>
      Array.from({ length: 24 }, (_, hour) => ({
        time: `${date}T${String(hour).padStart(2, '0')}:00`,
        temperature2m: hour >= 10 && hour < 18 ? 25 : 10,
        relativeHumidity2m: 50,
        dewPoint2m: 0,
        precipitation: 0,
      }))
    const dates = [`${year}-06-01`, `${year}-06-02`, `${year}-06-03`]
    await syncVineyardSeasonState(vineyard, { budbreak: `${year}-06-01` }, dates.flatMap(qualifyingDay))

    const now = new Date().toISOString()
    await db.sprays.add({
      vineyardId: VINEYARD_ID,
      datetime: `${year}-06-03T08:00`,
      product: 'Sulphur',
      activeSubstance: 'sulphur',
      dose: '5 kg/ha',
      target: 'powdery',
      createdAt: now,
      updatedAt: now,
    })
    await syncVineyardSeasonState(vineyard, { budbreak: `${year}-06-01` }, qualifyingDay(`${year}-06-04`))

    const record = await getSetting<{ state: GublerThomasState; resetFromDate: string }>(
      `gublerThomasState:${VINEYARD_ID}:${year}`,
    )
    expect(record?.resetFromDate).toBe(`${year}-06-04`)
    expect(record?.state.score).toBe(20)
  })

  it('hides the Goidanich snapshot after a recorded harvest', async () => {
    const vineyard = makeVineyard()
    await triggerPrimaryEvent(vineyard)
    const afterHarvest = `${year}-05-02`
    await syncVineyardSeasonState(
      vineyard,
      { budbreak, harvest: `${year}-05-01` },
      hourlyForDay(afterHarvest, 20, 90, 20),
      { fetchHistoricalHourly: async () => [] },
    )
    const snapshot = await db.dailyRisk.where('[vineyardId+date]').equals([VINEYARD_ID, afterHarvest]).first()
    expect(snapshot?.goidanichPct).toBeNull()
  })

  it('does not restart the Goidanich index for a spray targeting a different disease', async () => {
    const vineyard = makeVineyard()
    const eventDate = await triggerPrimaryEvent(vineyard)

    const now = new Date().toISOString()
    await db.sprays.add({
      vineyardId: VINEYARD_ID,
      datetime: `${year}-05-02T08:00`,
      product: 'Botrytis treatment',
      activeSubstance: 'test',
      dose: '1 l/ha',
      target: 'botrytis',
      createdAt: now,
      updatedAt: now,
    })

    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(`${year}-05-03`, 15, 50, 0))

    const record = await getSetting<{ resetFromDate: string }>(`goidanichState:${VINEYARD_ID}:${year}`)
    expect(record?.resetFromDate).toBe(eventDate)
  })

  it('calling sync again with no new data leaves the Goidanich state and snapshots unchanged (idempotence)', async () => {
    const vineyard = makeVineyard()
    await triggerPrimaryEvent(vineyard)
    const extraDay = `${year}-05-01`
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(extraDay, 20, 90, 20))

    const stateAfterFirstRun = await getSetting<{ state: GoidanichState; lastProcessedDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    const snapshotsAfterFirstRun = await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).sortBy('date')

    // Same call again, same day already folded in — nothing should move.
    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(extraDay, 20, 90, 20))

    const stateAfterReplay = await getSetting<{ state: GoidanichState; lastProcessedDate: string }>(
      `goidanichState:${VINEYARD_ID}:${year}`,
    )
    const snapshotsAfterReplay = await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).sortBy('date')

    expect(stateAfterReplay).toEqual(stateAfterFirstRun)
    expect(snapshotsAfterReplay).toEqual(snapshotsAfterFirstRun)
  })

  it('never lets a spray reset SET8,0, the event counter, or Gubler-Thomas', async () => {
    const vineyard = makeVineyard()
    await triggerPrimaryEvent(vineyard)

    const degreeSumBefore = await getSetting<{ state: number }>(`degreeSum:${VINEYARD_ID}:${year}:cz-morava`)
    const eventsBefore = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).count()
    const gublerBefore = await getSetting<{ state: GublerThomasState }>(`gublerThomasState:${VINEYARD_ID}:${year}`)

    const now = new Date().toISOString()
    await db.sprays.add({
      vineyardId: VINEYARD_ID,
      datetime: `${year}-05-02T08:00`,
      product: 'Downy treatment',
      activeSubstance: 'test',
      dose: '1 l/ha',
      target: 'downy',
      createdAt: now,
      updatedAt: now,
    })

    await syncVineyardSeasonState(vineyard, { budbreak }, hourlyForDay(`${year}-05-03`, 18, 50, 0))

    const degreeSumAfter = await getSetting<{ state: number }>(`degreeSum:${VINEYARD_ID}:${year}:cz-morava`)
    const eventsAfter = await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).count()
    const gublerAfter = await getSetting<{ state: GublerThomasState }>(`gublerThomasState:${VINEYARD_ID}:${year}`)

    // SET8,0 and the event count only ever grow forward from the same budbreak
    // anchor — a spray must not have wiped or restarted either.
    expect(degreeSumAfter!.state).toBeGreaterThanOrEqual(degreeSumBefore!.state)
    expect(eventsAfter).toBe(eventsBefore)
    expect(gublerAfter?.state.ignited).toBe(gublerBefore?.state.ignited)
  })
})
