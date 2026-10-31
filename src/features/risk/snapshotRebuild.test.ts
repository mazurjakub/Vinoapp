/**
 * File: snapshotRebuild.test.ts
 * Created: 2026-10-03
 * Description: Tests that daily risk snapshots are rebuilt correctly after a reset.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { getSetting } from '../../db/settingsRepo'
import type { DailyRisk, HourlyWeather, Vineyard } from '../../db/schema'
import { addDaysUTC, daysBetween, type GublerThomasState } from '../../rules'
import { localDateKey } from '../weather/format'
import { syncVineyardSeasonState } from './syncSeasonState'
import type { DailyAccumulatorRecord } from './dailyAccumulator'

const year = new Date().getFullYear()
const START = `${year}-01-01`
const VINEYARD_ID = 710000001

function hourlyForSeasonDay(date: string): HourlyWeather[] {
  const i = daysBetween(START, date)
  const temp = 15 + 10 * Math.sin(i / 3)
  const rh = 50 + 30 * Math.cos(i / 4)
  const precip = i % 7 < 4 ? 12 : 0
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature2m: temp,
    relativeHumidity2m: rh,
    dewPoint2m: 0,
    precipitation: hour === 0 ? precip : 0,
  }))
}

const vineyard: Vineyard = {
  id: VINEYARD_ID,
  name: 'Rebuild test',
  lat: 49,
  lon: 17,
  regionProfile: 'cz-morava',
  varietyId: 1,
  plantedYear: 2020,
  createdAt: '',
  updatedAt: '',
}

async function cleanup() {
  await db.infectionEvents.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).delete()
  for (const key of [`degreeSum:${VINEYARD_ID}:${year}:cz-morava`, `goidanichState:${VINEYARD_ID}:${year}`, `gublerThomasState:${VINEYARD_ID}:${year}`, `daySource:${VINEYARD_ID}:${year}`]) {
    const row = await db.settings.where('key').equals(key).first()
    if (row?.id !== undefined) await db.settings.delete(row.id)
  }
}

afterEach(cleanup)

const withoutIds = (rows: DailyRisk[]) =>
  rows.map((r) => ({ date: r.date, source: r.source, goidanichPct: r.goidanichPct, gublerScore: r.gublerScore, meanTempC: r.meanTempC }))

describe('snapshot rebuild', () => {
  it('restores the past snapshots when they are missing, matching the originals', async () => {
    const phenology = { budbreak: START }
    // Both runs see the same inputs: the whole season up to yesterday.
    const yesterday = addDaysUTC(localDateKey(new Date()), -1)
    const fetchRange = async (_lat: number, _lon: number, from: string, to: string) => {
      const out: string[] = []
      for (let d = from; d <= to; d = addDaysUTC(d, 1)) out.push(d)
      return out.flatMap(hourlyForSeasonDay)
    }
    const cache = await fetchRange(0, 0, START, yesterday)

    await syncVineyardSeasonState(vineyard, phenology, cache, { fetchHistoricalHourly: fetchRange })
    const before = withoutIds(await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).sortBy('date'))
    expect(before.length).toBeGreaterThan(20)

    // Simulate an installation that already had the accumulators but no snapshots yet.
    await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).delete()
    const result = await syncVineyardSeasonState(vineyard, phenology, cache, { fetchHistoricalHourly: fetchRange })
    expect(result.ok).toBe(true)

    const after = withoutIds(await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).sortBy('date'))
    expect(after).toEqual(before)
  })

  it('a failed rebuild leaves the stored accumulator state untouched', async () => {
    const phenology = { budbreak: START }
    const days = Array.from({ length: 10 }, (_, i) => addDaysUTC(START, i))
    const cache = days.flatMap(hourlyForSeasonDay)
    await syncVineyardSeasonState(vineyard, phenology, cache, { fetchHistoricalHourly: async () => [] })

    // Gubler-Thomas always runs (anchored at budbreak), so its stored record is a reliable witness here.
    const gublerBefore = await getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${VINEYARD_ID}:${year}`)
    expect(gublerBefore).toBeDefined()

    // Snapshots gone, and the network is down: the rebuild must not clobber what's stored.
    await db.dailyRisk.where('vineyardId').equals(VINEYARD_ID).delete()
    const failing = async () => {
      throw new Error('offline')
    }
    const result = await syncVineyardSeasonState(vineyard, phenology, cache, { fetchHistoricalHourly: failing })
    expect(result.ok).toBe(false)

    const gublerAfter = await getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${VINEYARD_ID}:${year}`)
    expect(gublerAfter).toEqual(gublerBefore)
  })
})
