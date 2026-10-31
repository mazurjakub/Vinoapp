/**
 * File: syncSeasonState.equivalence.test.ts
 * Created: 2026-10-20
 * Description: Tests that daily processing and processing after a gap give the same state and snapshots.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { getSetting } from '../../db/settingsRepo'
import type { DailyRisk, HourlyWeather, Vineyard } from '../../db/schema'
import { addDaysUTC, daysBetween, type GoidanichState, type GublerThomasState } from '../../rules'
import { syncVineyardSeasonState } from './syncSeasonState'
import type { DailyAccumulatorRecord } from './dailyAccumulator'

const SEASON_LENGTH = 30
const year = new Date().getFullYear()
const START_DATE = `${year}-01-01` // safely in the past relative to "today" in every test run this app will see

function paramsForIndex(i: number) {
  return {
    temp: 15 + 10 * Math.sin(i / 3),
    rh: 50 + 30 * Math.cos(i / 4),
    precip: i % 5 === 0 ? 12 : 0,
  }
}

function hourlyForDay(date: string, temp: number, rh: number, precip: number): HourlyWeather[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature2m: temp,
    relativeHumidity2m: rh,
    dewPoint2m: 0,
    precipitation: hour === 0 ? precip : 0,
  }))
}

function hourlyForSeasonDay(date: string): HourlyWeather[] {
  const i = daysBetween(START_DATE, date)
  const { temp, rh, precip } = paramsForIndex(i)
  return hourlyForDay(date, temp, rh, precip)
}

function makeVineyard(id: number): Vineyard {
  const now = new Date().toISOString()
  return {
    id,
    name: 'Equivalence test',
    lat: 49.0,
    lon: 17.0,
    regionProfile: 'cz-morava',
    varietyId: 1,
    plantedYear: 2020,
    createdAt: now,
    updatedAt: now,
  }
}

async function cleanup(vineyardId: number) {
  await db.infectionEvents.where('vineyardId').equals(vineyardId).delete()
  await db.dailyRisk.where('vineyardId').equals(vineyardId).delete()
  const keys = [
    `degreeSum:${vineyardId}:${year}:cz-morava`,
    `goidanichState:${vineyardId}:${year}`,
    `gublerThomasState:${vineyardId}:${year}`,
  ]
  for (const key of keys) {
    const row = await db.settings.where('key').equals(key).first()
    if (row?.id !== undefined) await db.settings.delete(row.id)
  }
}

// Ids and vineyardId differ by design (two vineyards); everything else must match.
const withoutId = (row: DailyRisk) => ({
  date: row.date,
  source: row.source,
  meanTempC: row.meanTempC,
  precipitationMm: row.precipitationMm,
  meanRhPct: row.meanRhPct,
  goidanichPct: row.goidanichPct,
  gublerScore: row.gublerScore,
})

const CONTINUOUS_ID = 700000001
const GAPPED_ID = 700000002
const CONTINUOUS_SPRAY_ID = 700000003
const GAPPED_SPRAY_ID = 700000004

afterEach(async () => {
  await cleanup(CONTINUOUS_ID)
  await cleanup(GAPPED_ID)
  await cleanup(CONTINUOUS_SPRAY_ID)
  await cleanup(GAPPED_SPRAY_ID)
  await db.sprays.where('vineyardId').anyOf([CONTINUOUS_SPRAY_ID, GAPPED_SPRAY_ID]).delete()
})

describe('syncVineyardSeasonState - equivalence of continuous vs. gapped processing', () => {
  it('reaches the same final SET8,0 / Goidanich / Gubler-Thomas state either way', async () => {
    const phenology = { budbreak: START_DATE }

    // (a) continuous: one call per day, each only "seeing" that single day
    // (simulating a well-behaved daily app refresh with no gaps).
    const continuousVineyard = makeVineyard(CONTINUOUS_ID)
    for (let i = 0; i < SEASON_LENGTH; i++) {
      const date = addDaysUTC(START_DATE, i)
      await syncVineyardSeasonState(continuousVineyard, phenology, hourlyForSeasonDay(date), {
        fetchHistoricalHourly: async () => [],
      })
    }

    // (b) gapped: process the first 10 days, then jump straight to the last
    // 2 days as if that's all the rolling cache currently shows — a 18-day
    // hole that must be backfilled from "Open-Meteo" (mocked here).
    const gappedVineyard = makeVineyard(GAPPED_ID)
    const firstChunk = Array.from({ length: 10 }, (_, i) => addDaysUTC(START_DATE, i)).flatMap(hourlyForSeasonDay)
    await syncVineyardSeasonState(gappedVineyard, phenology, firstChunk, {
      fetchHistoricalHourly: async () => [],
    })

    const lastTwoDays = [addDaysUTC(START_DATE, SEASON_LENGTH - 2), addDaysUTC(START_DATE, SEASON_LENGTH - 1)].flatMap(
      hourlyForSeasonDay,
    )
    const fetchHistoricalHourly = async (_lat: number, _lon: number, start: string, end: string) => {
      const days: string[] = []
      for (let d = start; d <= end; d = addDaysUTC(d, 1)) days.push(d)
      return days.flatMap(hourlyForSeasonDay)
    }
    await syncVineyardSeasonState(gappedVineyard, phenology, lastTwoDays, { fetchHistoricalHourly })

    const degreeSumA = await getSetting<DailyAccumulatorRecord<number>>(`degreeSum:${CONTINUOUS_ID}:${year}:cz-morava`)
    const degreeSumB = await getSetting<DailyAccumulatorRecord<number>>(`degreeSum:${GAPPED_ID}:${year}:cz-morava`)
    expect(degreeSumB?.state).toBeCloseTo(degreeSumA!.state, 6)
    expect(degreeSumB?.lastProcessedDate).toBe(degreeSumA?.lastProcessedDate)

    const eventsA = await db.infectionEvents.where('vineyardId').equals(CONTINUOUS_ID).sortBy('date')
    const eventsB = await db.infectionEvents.where('vineyardId').equals(GAPPED_ID).sortBy('date')
    expect(eventsB.map((e) => e.date)).toEqual(eventsA.map((e) => e.date))
    expect(eventsA.length).toBeGreaterThan(0) // sanity: the scenario actually exercises this path

    const goidanichA = await getSetting<DailyAccumulatorRecord<GoidanichState>>(`goidanichState:${CONTINUOUS_ID}:${year}`)
    const goidanichB = await getSetting<DailyAccumulatorRecord<GoidanichState>>(`goidanichState:${GAPPED_ID}:${year}`)
    expect(goidanichB?.resetFromDate).toBe(goidanichA?.resetFromDate)
    expect(goidanichB?.lastProcessedDate).toBe(goidanichA?.lastProcessedDate)
    expect(goidanichB?.state.accumulatedPct).toBeCloseTo(goidanichA!.state.accumulatedPct, 6)
    expect(goidanichB?.state.alertLevel).toBe(goidanichA?.state.alertLevel)

    const gublerA = await getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${CONTINUOUS_ID}:${year}`)
    const gublerB = await getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${GAPPED_ID}:${year}`)
    expect(gublerB?.lastProcessedDate).toBe(gublerA?.lastProcessedDate)
    expect(gublerB?.state).toEqual(gublerA?.state)

    // Ids and vineyardId differ by design (two vineyards); everything else must match.
    const snapshotsA = await db.dailyRisk.where('vineyardId').equals(CONTINUOUS_ID).sortBy('date')
    const snapshotsB = await db.dailyRisk.where('vineyardId').equals(GAPPED_ID).sortBy('date')
    expect(snapshotsA.length).toBe(SEASON_LENGTH)
    expect(snapshotsB.map(withoutId)).toEqual(snapshotsA.map(withoutId))
  })

  it('reaches the same state when a downy spray mid-season deactivates and a later event reactivates the Goidanich index', async () => {
    const phenology = { budbreak: START_DATE }

    // Days 0-16: build up SET8,0. Day 17: rain -> first primary event.
    // Day 18: downy spray (deactivates Goidanich). Days 19-24: quiet gap,
    // still inactive. Day 25: rain again -> second primary event, which
    // reactivates Goidanich from day 25, not from the spray date.
    function planForIndex(i: number): { temp: number; rh: number; precip: number } {
      if (i === 17 || i === 25) return { temp: 18, rh: 90, precip: 15 }
      return { temp: 18, rh: 50, precip: 0 }
    }
    function hourlyForPlanDay(date: string, i: number): HourlyWeather[] {
      const { temp, rh, precip } = planForIndex(i)
      return hourlyForDay(date, temp, rh, precip)
    }
    const sprayDate = addDaysUTC(START_DATE, 18)

    async function addDownySpray(vineyardId: number) {
      const now = new Date().toISOString()
      await db.sprays.add({
        vineyardId,
        datetime: `${sprayDate}T08:00`,
        product: 'Test fungicide',
        activeSubstance: 'test',
        dose: '1 l/ha',
        target: 'downy',
        createdAt: now,
        updatedAt: now,
      })
    }

    // (a) continuous: one call per day.
    const continuousVineyard = makeVineyard(CONTINUOUS_SPRAY_ID)
    await addDownySpray(CONTINUOUS_SPRAY_ID)
    for (let i = 0; i < SEASON_LENGTH; i++) {
      const date = addDaysUTC(START_DATE, i)
      await syncVineyardSeasonState(continuousVineyard, phenology, hourlyForPlanDay(date, i), {
        fetchHistoricalHourly: async () => [],
      })
    }

    // (b) gapped: first 10 days one by one, then the remaining 20 days in a
    // single call, as if the cache had simply jumped ahead that far.
    const gappedVineyard = makeVineyard(GAPPED_SPRAY_ID)
    await addDownySpray(GAPPED_SPRAY_ID)
    for (let i = 0; i < 10; i++) {
      const date = addDaysUTC(START_DATE, i)
      await syncVineyardSeasonState(gappedVineyard, phenology, hourlyForPlanDay(date, i), {
        fetchHistoricalHourly: async () => [],
      })
    }
    const restOfSeason = Array.from({ length: SEASON_LENGTH - 10 }, (_, j) => j + 10).flatMap((i) =>
      hourlyForPlanDay(addDaysUTC(START_DATE, i), i),
    )
    await syncVineyardSeasonState(gappedVineyard, phenology, restOfSeason, { fetchHistoricalHourly: async () => [] })

    const eventsA = await db.infectionEvents.where('vineyardId').equals(CONTINUOUS_SPRAY_ID).sortBy('date')
    const eventsB = await db.infectionEvents.where('vineyardId').equals(GAPPED_SPRAY_ID).sortBy('date')
    expect(eventsA.map((e) => e.date)).toEqual([addDaysUTC(START_DATE, 17), addDaysUTC(START_DATE, 25)])
    expect(eventsB.map((e) => e.date)).toEqual(eventsA.map((e) => e.date))

    const goidanichA = await getSetting<DailyAccumulatorRecord<GoidanichState>>(
      `goidanichState:${CONTINUOUS_SPRAY_ID}:${year}`,
    )
    const goidanichB = await getSetting<DailyAccumulatorRecord<GoidanichState>>(
      `goidanichState:${GAPPED_SPRAY_ID}:${year}`,
    )
    // Reactivated from the second event (day 25), not from the spray date (day 18).
    expect(goidanichA?.resetFromDate).toBe(addDaysUTC(START_DATE, 25))
    expect(goidanichB?.resetFromDate).toBe(goidanichA?.resetFromDate)
    expect(goidanichB?.lastProcessedDate).toBe(goidanichA?.lastProcessedDate)
    expect(goidanichB?.state).toEqual(goidanichA?.state)

    const snapshotsA = await db.dailyRisk.where('vineyardId').equals(CONTINUOUS_SPRAY_ID).sortBy('date')
    const snapshotsB = await db.dailyRisk.where('vineyardId').equals(GAPPED_SPRAY_ID).sortBy('date')
    expect(snapshotsA.length).toBe(SEASON_LENGTH)
    expect(snapshotsB.map(withoutId)).toEqual(snapshotsA.map(withoutId))

    // The inactive gap strictly after the spray (days 19-24) is explicitly null
    // in both, not a stale pre-spray value. (Day 18, the spray day itself, was
    // never active to begin with, so it's absent rather than nulled — see
    // syncSeasonState.test.ts for that distinction in isolation.)
    const byDate = new Map(snapshotsA.map((r) => [r.date, r]))
    for (let i = 19; i <= 24; i++) {
      expect(byDate.get(addDaysUTC(START_DATE, i))?.goidanichPct).toBeNull()
    }
  })
})
